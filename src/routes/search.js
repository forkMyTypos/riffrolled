// ── GET /api/search?q=…&limit=… ───────────────────────────────────────
// Cache-first: query D1; if enough rows, return (zero quota). Otherwise
// search YouTube, insert new tracks (deduped by url), re-query, return.
// Quota/rate-limit problems degrade to whatever the cache holds.

import { json, errorJson } from '../utils/response.js';
import { searchTracks, insertTracks, countAiLookups, addAiLookups } from '../db/queries.js';
import { getConfig } from '../config.js';
import { searchYouTube, YouTubeError } from '../services/youtube.js';

const MIN_LOCAL_RESULTS = 8;   // fewer local hits than this triggers a YouTube fetch
const YT_FETCH_SIZE = 50;     // the same 100 units as 15; every result joins the catalogue

export async function handleSearch(request, env, url) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return errorJson(env, 'Missing query parameter: q', 400);
  if (q.length > 200) return errorJson(env, 'Query too long', 400);

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);

  // 1) Local first.
  let results = await searchTracks(env.DB, q, limit);

  // source=db → catalogue-only search: never call YouTube, spend zero quota
  if (url.searchParams.get('source') === 'db') {
    return json(env, results, 200, { 'X-Riff-Source': 'db-only' });
  }

  if (results.length >= Math.min(MIN_LOCAL_RESULTS, limit)) {
    return json(env, results, 200, { 'X-Riff-Source': 'db' });
  }

  /* A daily cap, site-wide (SEARCH_YT_DAILY). search.list costs 100 of
     the key's 10,000 units a day, so without one, anybody looping this
     could use up the day's YouTube searching for everyone in minutes. The
     counter shares the AI DJ's table under its own key; it is taken before
     the call, so racing requests cannot overshoot. Over the cap, the
     catalogue's answer stands. */
  const cfg = await getConfig(env);
  const dayKey = 'search:' + new Date().toISOString().slice(0, 10);
  await addAiLookups(env.DB, dayKey, 1, new Date().toISOString());
  if ((await countAiLookups(env.DB, dayKey)) > cfg.SEARCH_YT_DAILY) {
    return json(env, results, 200, { 'X-Riff-Source': 'db', 'X-Riff-Warning': 'search_cap' });
  }

  // 2) Not enough — YouTube, cache, re-query.
  try {
    const fetched = await searchYouTube(env, q, YT_FETCH_SIZE);
    if (fetched.length) await insertTracks(env.DB, fetched, 'search', 1);   // ids came from YouTube itself
    results = await searchTracks(env.DB, q, limit);
    return json(env, results, 200, {
      'X-Riff-Source': fetched.length ? 'youtube+db' : 'db',
    });
  } catch (err) {
    if (err instanceof YouTubeError) {
      if (results.length) {
        return json(env, results, 200, { 'X-Riff-Source': 'db-stale', 'X-Riff-Warning': err.kind });
      }
      return errorJson(env, err.message, err.status, err.kind);
    }
    throw err;
  }
}
