// ── riffrolled API — Worker entry ─────────────────────────────────────
// Static assets in public/ are served automatically; everything under
// /api/* lands here. Framework-free router + one error boundary so the
// frontend always receives JSON.

import { handleMixPage } from './routes/mixpage.js';
import { errorJson, handleOptions, json } from './utils/response.js';
import { ensureSchema, LATEST_MIGRATION } from './db/migrations.js';
import { BUILD } from './build-info.js';
import { checkLimits, cacheSeconds, fromEdge, toEdge } from './guard.js';

import { handleSearch } from './routes/search.js';
import { handleListTracks, handleAddTrack } from './routes/tracks.js';
import { handleChannelImport, handlePlaylistImport } from './routes/channel.js';
import { handleResolve } from './routes/resolve.js';
import { handleAutomix, handleAutomixStatus, handleAutomixSwap, handleAutomixPrompts } from './routes/automix.js';
import { handleSavePlaylist } from './routes/playlists.js';
import { handleListMixes, handleGetMix, handleShareMix, handleMixPlay, handleMixReport, handleMyMixes } from './routes/mixes.js';
import { handleMineChallenge, handleMineSubmit, handleWallet, handleLedger } from './routes/mine.js';
import { handlePromote, handlePromotions, handlePromoNext, handlePromoEvent, handleMyPromotions, handlePromotionAction, handleBriefOffers, handleBriefClaim, handlePromoReport } from './routes/promote.js';
import { handlePublicConfig } from './routes/config.js';
import { handleStats } from './routes/stats.js';
import { sweep } from './sweep.js';
import { grow } from './grow.js';
import { refresh } from './refresh.js';
import { discover, harvest } from './channels.js';
import { callBudget } from './services/youtube.js';
import { getConfig } from './config.js';

const ROUTES = [
  // a shared mix's own page, with its link preview (GET and HEAD: link
  // previewers check with either). /p/ and /playlist/ redirect to /mix/.
  ['GET',  /^\/(mix|p|playlist)\/([A-Za-z0-9]{1,16})\/?$/, (req, env, url, m) => handleMixPage(req, env, url, m)],
  ['HEAD', /^\/(mix|p|playlist)\/([A-Za-z0-9]{1,16})\/?$/, (req, env, url, m) => handleMixPage(req, env, url, m)],
  ['GET',  /^\/api\/config$/,       (req, env) => handlePublicConfig(req, env)],
  ['POST', /^\/api\/stats$/,        (req, env) => handleStats(req, env)],
  ['GET',  /^\/api\/search$/, (req, env, url) => handleSearch(req, env, url)],
  ['GET',  /^\/api\/tracks$/, (req, env, url) => handleListTracks(req, env, url)],
  ['POST', /^\/api\/track$/,  (req, env) => handleAddTrack(req, env)],
  ['POST', /^\/api\/resolve$/, (req, env) => handleResolve(req, env)],
  ['POST', /^\/api\/automix$/, (req, env) => handleAutomix(req, env)],
  ['POST', /^\/api\/automix\/swap$/, (req, env) => handleAutomixSwap(req, env)],
  ['GET', /^\/api\/automix\/prompts$/, (req, env) => handleAutomixPrompts(req, env)],
  ['GET',  /^\/api\/automix$/, (req, env) => handleAutomixStatus(req, env)],
  ['POST', /^\/api\/playlist\/save$/, (req, env) => handleSavePlaylist(req, env)],
  ['GET',  /^\/api\/mixes$/,            (req, env, url) => handleListMixes(req, env, url)],
  ['POST', /^\/api\/mixes\/share$/,     (req, env) => handleShareMix(req, env)],
  ['GET',  /^\/api\/mixes\/mine$/,      (req, env) => handleMyMixes(req, env)],
  ['GET',  /^\/api\/mixes\/(\d+|[a-hj-km-np-z2-9]{8})$/, (req, env, url) => handleGetMix(req, env, url)],
  ['POST', /^\/api\/mixes\/\d+\/play$/,   (req, env, url) => handleMixPlay(req, env, url)],
  ['POST', /^\/api\/mixes\/\d+\/report$/, (req, env, url) => handleMixReport(req, env, url)],
  ['GET',  /^\/api\/channel$/, (req, env, url) => handleChannelImport(req, env, url)],
  ['GET',  /^\/api\/playlist$/, (req, env, url) => handlePlaylistImport(req, env, url)],
  ['POST', /^\/api\/mine\/challenge$/, (req, env) => handleMineChallenge(req, env)],
  ['POST', /^\/api\/mine\/submit$/,    (req, env) => handleMineSubmit(req, env)],
  ['GET',  /^\/api\/wallet$/,           (req, env, url) => handleWallet(req, env, url)],
  ['GET',  /^\/api\/ledger$/,           (req, env, url) => handleLedger(req, env, url)],
  ['POST', /^\/api\/promote$/,          (req, env) => handlePromote(req, env)],
  ['GET',  /^\/api\/promotions\/mine$/,  (req, env, url) => handleMyPromotions(req, env, url)],
  ['GET',  /^\/api\/promotions\/next$/,  (req, env, url) => handlePromoNext(req, env, url)],
  ['GET',  /^\/api\/promotions$/,       (req, env) => handlePromotions(req, env)],
  ['POST', /^\/api\/promo\/event$/,     (req, env) => handlePromoEvent(req, env)],
  ['POST', /^\/api\/promotion\/action$/, (req, env) => handlePromotionAction(req, env)],
  ['POST', /^\/api\/promo\/report$/,     (req, env) => handlePromoReport(req, env)],
  // AI brief placements: offered free, charged on copy
  ['POST', /^\/api\/promotions\/brief\/claim$/, (req, env) => handleBriefClaim(req, env)],
  ['POST', /^\/api\/promotions\/brief$/,        (req, env) => handleBriefOffers(req, env)],
];

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return handleOptions(env);
    const url = new URL(request.url);
    try {
      // Deploy check. Reports which build is serving and whether the database
      // caught up. Open CORS on this endpoint only — it reveals a build id and
      // a version number, and the deploy page calls it from outside the site.
      if (request.method === 'GET' && url.pathname === '/api/health') {
        let migrated = true;
        try { await ensureSchema(env.DB); }
        catch (err) { migrated = false; console.error('migration failed:', err.message); }
        return json(env, {
          ok: migrated, build: BUILD.id, schema: LATEST_MIGRATION,
          ...(migrated ? {} : { error: 'database migration failed — see the Worker logs' }),
        }, migrated ? 200 : 500, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      }

      // the same answer for everybody, asked again within a minute: from the
      // edge, no database, not counted against anyone (src/guard.js)
      const keep = cacheSeconds(request, url);
      if (keep) {
        const hit = await fromEdge(url);
        if (hit) return hit;
      }

      // per-visitor limits — a search that finds nothing reads every track
      const over = await checkLimits(request, env, url);
      if (over) {
        console.warn('rate limited: ' + over.tier + ' ' + request.method + ' ' + url.pathname);
        return json(env, { error: 'Too many requests — give it a minute and try again', code: 'rate_limited' }, 429,
          { 'Retry-After': '60', 'Cache-Control': 'no-store' });
      }

      // bring the database up to date before anything touches it — a no-op
      // after the first request in each isolate
      await ensureSchema(env.DB);

      for (const [method, pattern, handler] of ROUTES) {
        if (request.method !== method) continue;
        const m = pattern.exec(url.pathname);
        if (m) return toEdge(url, await handler(request, env, url, m), keep, ctx);
      }
      return errorJson(env, 'Not found', 404);
    } catch (err) {
      console.error('Unhandled error:', err && err.stack ? err.stack : err);
      return errorJson(env, 'Internal server error', 500);
    }
  },

  /**
   * Cron Trigger. Housekeeping only — see src/sweep.js.
   *
   * Deliberately separate from fetch(): a scheduled run has no request to
   * answer and no caller to return an error to, so the only useful thing
   * it can do with a failure is log it. sweep() therefore never throws;
   * it reports.
   */
  async scheduled(event, env, ctx) {
    const done = await sweep(env);
    if (done.errors.length) {
      console.error('sweep finished with problems:', done.errors.join(' | '));
    }
    console.log('sweep: deleted ' + done.campaigns + ' finished campaigns'
      + (done.offers ? ', pruned offers' : '')
      + (done.rate ? ', pruned mint rate' : ''));
    // one budget of outside requests for the whole run (the free plan allows 50)
    try { callBudget.left = (await getConfig(env)).CRON_CALLS; } catch (err) { callBudget.left = 40; }

    // the 30-day refresh first: keeping what we have honest comes before adding more
    try {
      const f = await refresh(env);
      console.log('refresh: ' + (f.skipped ? '(' + f.skipped + ') ' : '') + f.checked + ' checked via ' + f.via
        + ', ' + f.renamed + ' renamed, ' + f.struck + ' hidden, ' + f.deleted + ' deleted, ' + f.units + ' units');
    } catch (err) {
      console.error('refresh failed:', err && err.message);
    }
    // whole channels: find and describe them, then read the approved ones
    try {
      const d = await discover(env);
      const h = await harvest(env);
      console.log('channels: ' + d.added + ' new candidates, ' + d.described + ' described, ' + d.auto + ' auto-approved, '
        + d.resolved + ' added by hand; read ' + h.added + ' tracks, ' + (d.units + h.units) + ' units'
        + (h.channels.length ? ' — ' + h.channels.join(', ') : '') + (h.skipped ? ' (' + h.skipped + ')' : ''));
    } catch (err) {
      console.error('channels failed:', err && err.message);
    }
    // the catalogue grower: its own step, so a YouTube hiccup can't stop the sweep
    try {
      const g = await grow(env);
      console.log('grow: ' + (g.skipped ? '(' + g.skipped + ') ' : '') + g.added + ' tracks, ' + g.units + ' units'
        + (g.styles.length ? ' — ' + g.styles.join(', ') : ''));
    } catch (err) {
      console.error('grow failed:', err && err.message);
    }
    callBudget.left = Infinity;      // the same isolate may answer requests next: they have no such limit
  },
};
