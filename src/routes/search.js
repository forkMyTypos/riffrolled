// ── GET /api/search?q=…&limit=… ───────────────────────────────────────
// Cache-first: query D1; if enough rows, return (zero quota). Otherwise
// search YouTube, insert new tracks (deduped by url), re-query, return.
// Quota/rate-limit problems degrade to whatever the cache holds.

import { json, errorJson } from '../utils/response.js';
import { searchTracks, insertTracks, countAiLookups, addAiLookups, canonicalYouTubeUrl } from '../db/queries.js';
import { getConfig } from '../config.js';
import { searchYouTube, YouTubeError } from '../services/youtube.js';

const MIN_LOCAL_RESULTS = 8;   // fewer local hits than this triggers a YouTube fetch
const YT_FETCH_SIZE = 50;     // the same 100 units as 15; every result joins the catalogue

export async function handleSearch(request, env, url) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return errorJson(env, 'Missing query parameter: q', 400);
  if (q.length > 200) return errorJson(env, 'Query too long', 400);

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);

  /* One letter matches nearly everything and still makes the database look
     at every track; the panels only search from two letters anyway. */
  if (q.length < 2) return json(env, [], 200, { 'X-Riff-Source': 'too-short' });

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
    // the new rows by their links (indexed), not a second pass over the whole catalogue
    results = merge(results, await byUrls(env.DB, fetched, q), limit);
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

/* What a fresh search.list added, read back by url (the unique index), kept
   only when it matches the words the same way searchTracks does: a
   case-insensitive substring of name, artist or genre. */
async function byUrls(db, fetched, q) {
  const urls = [...new Set((fetched || []).map((t) => canonicalYouTubeUrl(t.url)).filter(Boolean))].slice(0, 90);
  if (!urls.length) return [];
  const marks = urls.map((_, i) => '?' + (i + 1)).join(',');
  const { results } = await db.prepare(
    `SELECT id, name, artist, genre, genre_raw, url FROM tracks WHERE verified = 1 AND url IN (${marks})`
  ).bind(...urls).all();
  const needle = q.toLowerCase();
  return (results || [])
    .filter((r) => [r.name, r.artist, r.genre, r.genre_raw].some((v) => String(v || '').toLowerCase().includes(needle)))
    .map(({ genre_raw, ...row }) => row);
}

/** Earlier hits plus new ones, newest first, no repeats — the order searchTracks gives. */
function merge(a, b, limit) {
  const seen = new Set();
  return [...(a || []), ...(b || [])]
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    .sort((x, y) => y.id - x.id)
    .slice(0, limit);
}
