// ── riff token mining (hashcash, RPOW-spirit) ─────────────────────────
//   POST /api/mine/challenge { wallet }            → { challenge, difficulty_bits, reward, … }
//   POST /api/mine/submit    { wallet, challenge, nonce } → { ok, reward, balance }
//   GET  /api/wallet?wallet=…                      → { balance, difficulty_bits, tier, … }
//
// The client grinds SHA-256(challenge + ':' + nonce) until it has enough
// leading zero bits; the Worker verifies in one hash. Challenges are
// single-use and expire, so a found nonce can't be replayed. Minting only
// ever happens here — the ledger stays honest for any future phase.
//
// WHAT LIMITS MINTING, AND WHAT USED TO
//
// There was a per-wallet daily cap. It has been removed, because it was
// not a limit on anything. Proof of work is Sybil-resistant for a precise
// reason: the scarce thing is CPU, and nobody can fake a hash they did not
// compute. A cap counted per identity inherits none of that, because a
// wallet here is 64 random hex characters that cost nothing to generate.
// Whoever was willing to keep fifty wallets in fifty tabs had fifty times
// the cap and never noticed it; the one person it bound was the honest
// user with a single wallet. A limit that only the honest feel is worse
// than no limit, because it buys the illusion of one.
//
// So difficulty is now the only brake, and it moves:
//
//   effective bits = clamp(BASE + adjustment − tier discount, FLOOR, CEIL)
//
//   BASE       what the operator set, the resting difficulty
//   adjustment the site-wide retarget. Never negative: it defends against
//              inflation and does not hand out discounts. If a quiet hour
//              made mining cheap, waiting for a quiet hour would be the
//              cheapest way to mine, and BASE would stop meaning anything.
//   discount   bits off for having joined early, for good
//
// The discount is safe against the trick that killed the cap. Your CPU is
// the constraint, and every wallet you hold gets the same discount, so a
// thousand early wallets mine no faster than one early wallet. It rewards
// being early, which is the whole intent.

import { json, errorJson, readJson, nowIso } from '../utils/response.js';
import { getConfig } from '../config.js';
import { epochOf } from '../contrib.js';
import {
  WALLET_RE, ensureWallet, walletBalance, countMinedToday,
  addLedger, createChallenge, getChallenge, useChallenge,
  walletLedger, walletTotals, walletSeq, contribStanding,
  bumpMintRate, recentMintRate, pruneMintRate,
  getMineState, setMineAdjustment, setMineRate,
} from '../db/queries.js';

/* Reads through src/config.js: the D1 config table first, then the
   wrangler.toml [vars] this used to read directly, then the shipped
   defaults. Async now, because the first layer is a database. */
export async function mineConfig(env) {
  const c = await getConfig(env);
  const base = c.MINE_DIFFICULTY_BITS;

  /* The floor and ceiling bound the retarget and the tier discount; they
     are not meant to override the operator's own base. SCHEMA validates
     each key on its own and cannot express "ceiling >= base", so the
     three are reconciled here, and the base always wins.

     Without this, setting the base above the ceiling did something quietly
     wrong rather than something visibly wrong: effective difficulty was
     clamped down to the ceiling, AND the retarget was pinned at zero
     because it had no headroom left to add — so turning the base up past
     the ceiling turned the brake off. Found by a test that had its numbers
     the wrong way round, which is the useful kind of accident. */
  const floor = Math.min(c.MINE_DIFFICULTY_FLOOR, base);
  const ceil = Math.max(c.MINE_DIFFICULTY_CEIL, base);

  return {
    difficulty: base,
    reward: c.MINE_REWARD,
    promoteCost: c.PROMOTE_COST,
    promoteHours: c.PROMOTE_HOURS,
    targetPerHour: c.MINE_TARGET_PER_HOUR,
    windowH: c.MINE_RETARGET_WINDOW_H,
    floor,
    ceil,
    tier1Until: c.MINE_TIER1_UNTIL,
    tier1Discount: c.MINE_TIER1_DISCOUNT,
    tier2Until: c.MINE_TIER2_UNTIL,
    tier2Discount: c.MINE_TIER2_DISCOUNT,
  };
}

/** Which tier a joining number falls in, and what it takes off. */
export function tierFor(cfg, seq) {
  if (seq == null || seq <= 0) return { tier: 0, discount: 0 };
  if (seq <= cfg.tier1Until) return { tier: 1, discount: cfg.tier1Discount };
  if (seq <= cfg.tier2Until) return { tier: 2, discount: cfg.tier2Discount };
  return { tier: 0, discount: 0 };
}

/* At least this long between two difficulty changes. One bit doubles the
   work, so the controller has to be patient or it oscillates: raise the
   bar, watch the rate halve, drop it again, watch it double. An hour is
   long enough for the new difficulty to show up in the measured rate. */
const RETARGET_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Read the rate and, at most once an hour, step the adjustment.
 *
 * Deliberately lazy — it runs when a challenge is handed out rather than
 * on a timer, because riffrolled has no scheduler on the free plan and a
 * controller nobody invokes is a controller that does nothing. The cost
 * is two reads on a normal call and three writes on the one call an hour
 * that actually moves the dial.
 *
 * Bits are coarse: a step is a doubling, so the trigger is a doubling
 * too. Nothing happens until the rate is twice the target or half of it,
 * which is the honest resolution of a leading-zero-bits scheme. (A
 * continuous 256-bit target would let this be a smooth controller; it
 * would also mean a new wire format and a rewritten client worker, and
 * the coarse version is right until the coarseness is the thing that
 * hurts.)
 */
export async function retarget(env, cfg, now) {
  const state = await getMineState(env.DB);
  if (!cfg.targetPerHour) return state.adjustment;    // retargeting off

  const rate = await recentMintRate(env.DB, now, cfg.windowH);

  const since = state.changed_at ? Date.parse(state.changed_at) : 0;
  const cool = !state.changed_at || (Date.parse(now) - since) >= RETARGET_COOLDOWN_MS;
  if (!cool) {
    if (Math.abs(rate - state.rate) > 0.5) await setMineRate(env.DB, rate);
    return state.adjustment;
  }

  let next = state.adjustment;
  if (rate > cfg.targetPerHour * 2) next = state.adjustment + 1;
  else if (rate < cfg.targetPerHour / 2) next = Math.max(0, state.adjustment - 1);

  // the ceiling is on effective bits, so cap the adjustment by what the
  // base already uses up — no point banking adjustment that cannot apply
  next = Math.min(next, Math.max(0, cfg.ceil - cfg.difficulty));

  if (next === state.adjustment) {
    if (Math.abs(rate - state.rate) > 0.5) await setMineRate(env.DB, rate);
    return state.adjustment;
  }
  if (await setMineAdjustment(env.DB, next, rate, now, state.changed_at)) {
    await pruneMintRate(env.DB, now);
    return next;
  }
  return state.adjustment;                            // another isolate won
}

/** Everything that decides how hard this wallet's next challenge is. */
export async function difficultyFor(env, cfg, wallet, now) {
  const adjustment = await retarget(env, cfg, now);
  const { tier, discount } = tierFor(cfg, await walletSeq(env.DB, wallet));
  const bits = Math.max(cfg.floor,
    Math.min(cfg.ceil, cfg.difficulty + adjustment - discount));
  return { bits, adjustment, tier, discount };
}

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Count leading zero bits of a byte array. */
function leadingZeroBits(bytes) {
  let bits = 0;
  for (const b of bytes) {
    if (b === 0) { bits += 8; continue; }
    let v = b;
    while ((v & 0x80) === 0) { bits++; v <<= 1; }
    break;
  }
  return bits;
}

export async function handleMineChallenge(request, env) {
  const body = await readJson(request);
  const wallet = String(body?.wallet || '');
  if (!WALLET_RE.test(wallet)) return errorJson(env, 'Invalid wallet', 400);

  const cfg = await mineConfig(env);
  const now = nowIso();
  await ensureWallet(env.DB, wallet, now);

  /* No cap check. The difficulty this returns is the limit, and it is the
     same limit for everyone holding one wallet or a thousand. */
  const { bits, adjustment, tier, discount } = await difficultyFor(env, cfg, wallet, now);

  const challenge = randomHex(16);
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes to solve
  /* The difficulty is written onto the challenge row, and the submit path
     verifies against that row rather than against config. So a retarget
     between handing out a challenge and solving it never invalidates work
     already in progress — you are judged by the bar you were given. */
  await createChallenge(env.DB, challenge, wallet, bits, now, expires);
  return json(env, {
    challenge, difficulty_bits: bits, reward: cfg.reward,
    tier, tier_discount: discount, retarget_bits: adjustment,
  });
}

export async function handleMineSubmit(request, env) {
  const body = await readJson(request);
  const wallet = String(body?.wallet || '');
  const challenge = String(body?.challenge || '');
  const nonce = String(body?.nonce || '');
  if (!WALLET_RE.test(wallet)) return errorJson(env, 'Invalid wallet', 400);
  if (!/^[0-9a-f]{32}$/.test(challenge) || nonce.length === 0 || nonce.length > 64) {
    return errorJson(env, 'Invalid challenge or nonce', 400);
  }

  const row = await getChallenge(env.DB, challenge);
  if (!row || row.wallet_id !== wallet) return errorJson(env, 'Unknown challenge', 404);
  if (row.expires_at <= nowIso()) return errorJson(env, 'Challenge expired — request a new one', 410);

  // one SHA-256 verifies the client's work
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${challenge}:${nonce}`))
  );
  if (leadingZeroBits(digest) < row.difficulty) {
    return errorJson(env, 'Proof of work does not meet the difficulty', 400);
  }

  // single-use: only the first valid submit mints
  if (!(await useChallenge(env.DB, challenge))) {
    return errorJson(env, 'Challenge already redeemed', 409);
  }

  const cfg = await mineConfig(env);
  const mintedAt = nowIso();
  await addLedger(env.DB, wallet, cfg.reward, 'mine', challenge, mintedAt);
  /* The hourly counter the retarget reads, bumped by the credits minted
     rather than by one solve — the target is written in credits/hour, so
     raising MINE_REWARD has to move the measured rate with it or the
     controller would quietly aim at a different number than the one in
     the config. After the ledger write, so a failure here loses a
     measurement rather than a credit. */
  await bumpMintRate(env.DB, mintedAt, cfg.reward);
  const balance = await walletBalance(env.DB, wallet);
  return json(env, { ok: true, reward: cfg.reward, balance });
}

export async function handleWallet(request, env, url) {
  const wallet = String(url.searchParams.get('wallet') || '');
  if (!WALLET_RE.test(wallet)) return errorJson(env, 'Invalid wallet', 400);
  const cfg = await mineConfig(env);
  const now = nowIso();
  await ensureWallet(env.DB, wallet, now);
  const balance = await walletBalance(env.DB, wallet);
  const totals = await walletTotals(env.DB, wallet);

  /* mined_today stays, without a cap beside it. It was only ever shown as
     "n of 50"; as a plain number it is still the thing a miner wants to
     know, and it no longer implies a ceiling that is not there. */
  const minedToday = await countMinedToday(env.DB, wallet, now.slice(0, 10));

  const seq = await walletSeq(env.DB, wallet);
  const { tier, discount } = tierFor(cfg, seq);
  const state = await getMineState(env.DB);

  /* Contribution standing. Best-effort: a wallet view that fails because
     the rewards table is unhappy would take the balance down with it. */
  let contrib = null;
  try {
    const full = await getConfig(env);
    if (full.CONTRIB_POOL_PER_EPOCH) {
      const epoch = epochOf(now, full.CONTRIB_EPOCH_HOURS);
      const s = await contribStanding(env.DB, wallet, epoch);
      contrib = {
        epoch,
        points: s.points,
        total_points: s.total,
        contributors: s.contributors,
        pool: full.CONTRIB_POOL_PER_EPOCH,
        cap: full.CONTRIB_MAX_POINTS_PER_EPOCH,
        // what they would get if the epoch closed right now
        projected: s.total ? Math.floor((full.CONTRIB_POOL_PER_EPOCH * s.points) / s.total) : 0,
      };
    }
  } catch (e) { contrib = null; }
  const bits = Math.max(cfg.floor,
    Math.min(cfg.ceil, cfg.difficulty + state.adjustment - discount));

  return json(env, {
    balance,
    earned: totals.earned,
    spent: totals.spent,
    mined_today: minedToday,
    promote_cost: cfg.promoteCost,
    promote_hours: cfg.promoteHours,

    // what this wallet's next challenge will cost it, and why
    difficulty_bits: bits,
    base_bits: cfg.difficulty,
    retarget_bits: state.adjustment,
    tier,
    tier_discount: discount,
    joined: seq,
    // the site-wide rate the retarget is reacting to, so the number is
    // explicable rather than mysterious
    mint_rate_per_hour: Math.round((state.rate || 0) * 10) / 10,
    mint_target_per_hour: cfg.targetPerHour,

    /* What this wallet has contributed so far this period, and what the
       pool is. Shown rather than hidden because a reward nobody can see
       accruing is indistinguishable from no reward — and because the
       share depends on everybody else's points, so a number without its
       denominator would be a promise riffrolled cannot keep. */
    contrib,
  });
}

/** GET /api/ledger?wallet=… — the wallet's own recent mints and spends. */
export async function handleLedger(request, env, url) {
  const wallet = String(url.searchParams.get('wallet') || '');
  if (!WALLET_RE.test(wallet)) return errorJson(env, 'Invalid wallet', 400);
  const rows = await walletLedger(env.DB, wallet, 40);
  return json(env, rows);
}
