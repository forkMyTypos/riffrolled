// ── GET /api/search?q=…&limit=… ───────────────────────────────────────
// Cache-first: query D1; if enough rows, return (zero quota). Otherwise
// search YouTube, insert new tracks (deduped by url), re-query, return.
// Quota/rate-limit problems degrade to whatever the cache holds.

import { json, errorJson } from '../utils/response.js';
import { searchTracks, insertTracks } from '../db/queries.js';
import { searchYouTube, YouTubeError } from '../services/youtube.js';

const MIN_LOCAL_RESULTS = 8;   // fewer local hits than this triggers a YouTube fetch
const YT_FETCH_SIZE = 15;

export async function handleSearch(request, env, url) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return errorJson(env, 'Missing query parameter: q', 400);
  if (q.length > 200) return errorJson(env, 'Query too long', 400);

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);

  // 1) Local first.
  let results = await searchTracks(env.DB, q, limit);
  if (results.length >= Math.min(MIN_LOCAL_RESULTS, limit)) {
    return json(env, results, 200, { 'X-Riff-Source': 'db' });
  }

  // 2) Not enough — YouTube, cache, re-query.
  try {
    const fetched = await searchYouTube(env, q, YT_FETCH_SIZE);
    if (fetched.length) await insertTracks(env.DB, fetched);
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
