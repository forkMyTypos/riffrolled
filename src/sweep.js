// ── housekeeping, on a schedule ───────────────────────────────────────
//
// Three tables grow with use and none of them should grow forever:
//
//   promotions   a campaign that has spent its last credit is finished.
//                It is kept for a grace period and then deleted.
//   brief_offers an offer nobody came back to copy is dead weight after
//                a day; a charged one is kept until its campaign goes,
//                because it is the only thing stopping a second charge.
//   mint_rate    one row an hour forever is 8,760 rows a year, which is
//                nothing, but a week of history is all the retarget
//                reads.
//
// WHY A CRON AND NOT A REQUEST HOOK
//
// The brief endpoint prunes offers on a sample of requests, which is fine
// for rows that only matter in aggregate. Deleting a campaign is not that
// kind of job: it has to happen on a predictable clock whether or not
// anybody visited, and it must not land in the middle of somebody's
// request. A Cron Trigger is free on the Workers free plan and is the
// right tool.
//
// THE GRACE PERIOD IS THE POINT
//
// A finished campaign's numbers — what it showed, what it was played and
// liked, what it cost — belong to the person who paid for them. The
// browser takes a local snapshot when it next sees the campaign finished,
// and the sweeper waits long enough for that to have happened. Sweeping
// immediately would mean deleting somebody's only record of what they
// bought, which is why PROMO_SWEEP_HOURS is a config value rather than a
// literal, and why it is read rather than assumed.

import { getConfig } from './config.js';
import { ensureSchema } from './db/migrations.js';
import {
  sweepableCampaigns, deleteCampaigns, pruneBriefOffers, pruneMintRate,
} from './db/queries.js';
import { payDueEpochs } from './contrib.js';

/**
 * One housekeeping pass. Returns what it did, so the Worker log says
 * something useful rather than nothing.
 *
 * Every step is wrapped on its own: a failure in one table must not stop
 * the others, because the alternative is one broken step quietly
 * stopping all housekeeping forever.
 */
export async function sweep(env, now = new Date().toISOString()) {
  const out = { campaigns: 0, offers: false, rate: false, paid: [], errors: [] };

  try {
    await ensureSchema(env.DB);
  } catch (err) {
    // nothing else can run against a schema that is not there
    out.errors.push('schema: ' + (err && err.message));
    return out;
  }

  let grace = 24;
  try {
    grace = (await getConfig(env)).PROMO_SWEEP_HOURS;
  } catch (err) {
    out.errors.push('config: ' + (err && err.message));
  }

  try {
    const ids = await sweepableCampaigns(env.DB, now, grace);
    out.campaigns = await deleteCampaigns(env.DB, ids);
  } catch (err) {
    out.errors.push('campaigns: ' + (err && err.message));
  }

  try {
    await pruneBriefOffers(env.DB, now, 24);
    out.offers = true;
  } catch (err) {
    out.errors.push('offers: ' + (err && err.message));
  }

  try {
    await pruneMintRate(env.DB, now);
    out.rate = true;
  } catch (err) {
    out.errors.push('rate: ' + (err && err.message));
  }

  /* Contribution rewards for any epoch that has closed. This is the one
     step here that creates credits rather than deleting rows, so it is
     also the one where a retry must not repeat itself — contrib.js
     claims the epoch before paying anybody. */
  try {
    out.paid = await payDueEpochs(env, now);
  } catch (err) {
    out.errors.push('contrib: ' + (err && err.message));
  }

  return out;
}
