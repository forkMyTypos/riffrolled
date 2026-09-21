// ── riffrolled API — Worker entry ─────────────────────────────────────
// Static assets in public/ are served automatically; everything under
// /api/* lands here. Framework-free router + one error boundary so the
// frontend always receives JSON.

import { errorJson, handleOptions, json } from './utils/response.js';
import { ensureSchema, LATEST_MIGRATION } from './db/migrations.js';
import { BUILD } from './build-info.js';

import { handleSearch } from './routes/search.js';
import { handleListTracks, handleAddTrack } from './routes/tracks.js';
import { handleChannelImport, handlePlaylistImport } from './routes/channel.js';
import { handleMineChallenge, handleMineSubmit, handleWallet, handleLedger } from './routes/mine.js';
import { handlePromote, handlePromotions, handlePromoEvent, handleMyPromotions, handlePromotionAction } from './routes/promote.js';

const ROUTES = [
  ['GET',  /^\/api\/search$/, (req, env, url) => handleSearch(req, env, url)],
  ['GET',  /^\/api\/tracks$/, (req, env, url) => handleListTracks(req, env, url)],
  ['POST', /^\/api\/track$/,  (req, env) => handleAddTrack(req, env)],
  ['GET',  /^\/api\/channel$/, (req, env, url) => handleChannelImport(req, env, url)],
  ['GET',  /^\/api\/playlist$/, (req, env, url) => handlePlaylistImport(req, env, url)],
  ['POST', /^\/api\/mine\/challenge$/, (req, env) => handleMineChallenge(req, env)],
  ['POST', /^\/api\/mine\/submit$/,    (req, env) => handleMineSubmit(req, env)],
  ['GET',  /^\/api\/wallet$/,           (req, env, url) => handleWallet(req, env, url)],
  ['GET',  /^\/api\/ledger$/,           (req, env, url) => handleLedger(req, env, url)],
  ['POST', /^\/api\/promote$/,          (req, env) => handlePromote(req, env)],
  ['GET',  /^\/api\/promotions\/mine$/,  (req, env, url) => handleMyPromotions(req, env, url)],
  ['GET',  /^\/api\/promotions$/,       (req, env) => handlePromotions(req, env)],
  ['POST', /^\/api\/promo\/event$/,     (req, env) => handlePromoEvent(req, env)],
  ['POST', /^\/api\/promotion\/action$/, (req, env) => handlePromotionAction(req, env)],
];

export default {
  async fetch(request, env) {
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

      // bring the database up to date before anything touches it — a no-op
      // after the first request in each isolate
      await ensureSchema(env.DB);

      for (const [method, pattern, handler] of ROUTES) {
        if (request.method !== method) continue;
        const m = pattern.exec(url.pathname);
        if (m) return await handler(request, env, url, m);
      }
      return errorJson(env, 'Not found', 404);
    } catch (err) {
      console.error('Unhandled error:', err && err.stack ? err.stack : err);
      return errorJson(env, 'Internal server error', 500);
    }
  },
};
