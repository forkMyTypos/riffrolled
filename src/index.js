// ── riffrolled API — Worker entry ─────────────────────────────────────
// Static assets in public/ are served automatically; everything under
// /api/* lands here. Framework-free router + one error boundary so the
// frontend always receives JSON.

import { errorJson, handleOptions } from './utils/response.js';
import { handleSearch } from './routes/search.js';
import { handleListTracks, handleAddTrack } from './routes/tracks.js';
import { handleChannelImport } from './routes/channel.js';

const ROUTES = [
  ['GET',  /^\/api\/search$/, (req, env, url) => handleSearch(req, env, url)],
  ['GET',  /^\/api\/tracks$/, (req, env, url) => handleListTracks(req, env, url)],
  ['POST', /^\/api\/track$/,  (req, env) => handleAddTrack(req, env)],
  ['GET',  /^\/api\/channel$/, (req, env, url) => handleChannelImport(req, env, url)],
];

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return handleOptions(env);
    const url = new URL(request.url);
    try {
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
