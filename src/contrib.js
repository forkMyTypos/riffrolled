// ── rewarding contribution ────────────────────────────────────────────
//
// THE PROBLEM THIS HAD TO SOLVE FIRST
//
// The obvious reward engine pays people when the tracks they added get
// played and liked. riffrolled cannot do that, and the note at the top of
// routes/stats.js says why: the play and like counters arrive from the
// browser with no wallet, no session and no way for the server to tell a
// listener from a loop. They are good enough to rank a catalogue. They
// are not evidence, and wiring a credit to them would mean paying people
// for numbers they can type.
//
// Two honest ways out:
//
//   1. Make consumption provable — signed listening tokens, redeemed with
//      proof of work. Possible, and it is where this goes if it ever has
//      to. It also makes every listener's browser grind while they listen
//      to pay somebody else, which is a real cost to real people.
//   2. Stop paying for consumption. Pay only for things the Worker itself
//      did and saw.
//
// This is (2). Nothing here reads a counter the browser sent.
//
// WHAT THE WORKER ACTUALLY KNOWS
//
//   · It asked YouTube whether a video exists, and got an answer. A
//     contributor cannot fake that.
//   · It knows whether the track was already in the catalogue, because
//     the insert is NOT EXISTS. Only the first person to add a video is
//     adding anything.
//   · It knows who first published a link, because links.created_by is
//     written once and never reassigned.
//
// THE PART THAT STOPS IT BEING FARMED
//
// None of the above stops a script adding ten thousand real YouTube ids.
// Nothing can: riffrolled genuinely cannot distinguish a prolific curator
// from a bot, and pretending otherwise would be the same mistake as the
// per-wallet mining cap.
//
// So the payout is not per contribution. A fixed pool of credits is
// divided among contributors each epoch, in proportion to their points.
// Flooding the catalogue moves your share of a fixed pool; it does not
// create credits. If a farm earns 90% of the points it gets 90% of the
// pool and everybody else gets less — unpleasant, but the currency does
// not inflate, which is the thing that would actually break the economy.
// A per-wallet cap on points per epoch blunts even that, and unlike the
// mining cap it costs nothing to be wrong about: the worst case is a
// genuine curator hitting a ceiling and being paid the maximum.
//
// This is the same shape as the mining retarget in routes/mine.js, and
// for the same reason: bound what is created site-wide, rather than
// trying to judge each individual.

import { getConfig } from './config.js';
import {
  addContribPoints, epochTotals, walletsInEpoch, addLedger,
  markEpochPaid, isEpochPaid, pruneContrib,
} from './db/queries.js';

/** Which accounting period a moment falls in: 'YYYY-MM-DD' or '…THH'. */
export function epochOf(now, hours) {
  const iso = String(now);
  if (hours >= 24) return iso.slice(0, 10);
  // sub-daily epochs are bucketed to the hour boundary they start on
  const h = Math.max(1, Math.floor(hours));
  const d = new Date(Date.parse(iso));
  const bucket = Math.floor(d.getUTCHours() / h) * h;
  return iso.slice(0, 10) + 'T' + String(bucket).padStart(2, '0');
}

/**
 * Record a contribution. Never pays out — that happens at epoch end.
 *
 * Deliberately separate from the payout so a contribution can be recorded
 * inside the request that caused it, cheaply, while the division of the
 * pool needs to know every contributor and therefore cannot happen until
 * the epoch is over.
 */
export async function credit(env, wallet, kind, now) {
  if (!wallet) return 0;
  let cfg;
  try { cfg = await getConfig(env); } catch (e) { return 0; }
  if (!cfg.CONTRIB_POOL_PER_EPOCH) return 0;        // rewards switched off

  const points = kind === 'add' ? cfg.CONTRIB_ADD_POINTS
               : kind === 'link' ? cfg.CONTRIB_LINK_POINTS
               : 0;
  if (!points) return 0;

  try {
    return await addContribPoints(
      env.DB, wallet, epochOf(now, cfg.CONTRIB_EPOCH_HOURS),
      points, cfg.CONTRIB_MAX_POINTS_PER_EPOCH, now
    );
  } catch (e) {
    /* A contribution that cannot be recorded must never fail the request
       that made it. Somebody adding a track to the catalogue is doing the
       useful thing; the reward is a bonus on top, and losing one point is
       a far better outcome than losing the track. */
    return 0;
  }
}

/**
 * Pay out a finished epoch. Called by the sweeper.
 *
 * `markEpochPaid` is claimed BEFORE any credit is written. Two sweeps
 * racing — or one retried after a timeout — must not pay the same epoch
 * twice, and the ledger has no idempotency of its own. Claiming first
 * means the worst case is an epoch marked paid whose credits partly
 * failed, which loses somebody credits; claiming last would mean paying
 * twice, which creates them. Given the choice, lose.
 */
export async function payEpoch(env, epoch, now) {
  const out = { epoch, wallets: 0, credits: 0, skipped: '' };
  const cfg = await getConfig(env);
  const pool = cfg.CONTRIB_POOL_PER_EPOCH;
  if (!pool) { out.skipped = 'rewards off'; return out; }

  const totals = await epochTotals(env.DB, epoch);
  if (!totals.points) { out.skipped = 'no contributions'; return out; }

  if (!(await markEpochPaid(env.DB, epoch, now))) { out.skipped = 'already paid'; return out; }

  const rows = await walletsInEpoch(env.DB, epoch);
  for (const r of rows) {
    /* Floor, so the pool is never overspent. The remainder — at most one
       credit per contributor — is simply not minted. Rounding up would
       mean the number of contributors decides how many credits exist,
       which is the one thing this design exists to prevent. */
    const share = Math.floor((pool * r.points) / totals.points);
    if (share <= 0) continue;
    await addLedger(env.DB, r.wallet_id, share, 'contrib', epoch, now);
    out.wallets++;
    out.credits += share;
  }
  return out;
}

/**
 * Every finished epoch that has not been paid, paid.
 *
 * Looks back a few epochs rather than only at the last one, so a sweeper
 * that was down for a day catches up instead of silently dropping
 * everybody's rewards for the epochs it missed.
 */
export async function payDueEpochs(env, now = new Date().toISOString(), lookback = 7) {
  const results = [];
  let cfg;
  try { cfg = await getConfig(env); } catch (e) { return results; }
  if (!cfg.CONTRIB_POOL_PER_EPOCH) return results;

  const hours = cfg.CONTRIB_EPOCH_HOURS;
  const current = epochOf(now, hours);
  for (let i = 1; i <= lookback; i++) {
    const past = epochOf(new Date(Date.parse(now) - i * hours * 3600_000).toISOString(), hours);
    if (past === current) continue;                 // never pay an open epoch
    if (await isEpochPaid(env.DB, past)) continue;
    const r = await payEpoch(env, past, now);
    if (r.wallets || (r.skipped && r.skipped !== 'no contributions')) results.push(r);
  }
  await pruneContrib(env.DB, now, hours * (lookback + 7));
  return results;
}
