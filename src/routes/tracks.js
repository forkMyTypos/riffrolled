// ── Track routes ──────────────────────────────────────────────────────
//   GET  /api/tracks?genre=&limit=   list (optionally by genre)
//   POST /api/track                  { name, artist?, genre?, url } manual add

import { json, errorJson, readJson } from '../utils/response.js';
import { listTracks, insertTracks, getTrackByUrl } from '../db/queries.js';

export async function handleListTracks(request, env, url) {
  const genre = (url.searchParams.get('genre') || '').trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
  const results = await listTracks(env.DB, genre, limit);
  return json(env, results);
}

export async function handleAddTrack(request, env) {
  const body = await readJson(request);
  const name = (body?.name || '').trim();
  const trackUrl = (body?.url || '').trim();
  if (!name) return errorJson(env, 'Missing track name', 400);
  if (!trackUrl) return errorJson(env, 'Missing track url', 400);
  if (trackUrl.length > 500 || name.length > 300) return errorJson(env, 'Field too long', 400);

  await insertTracks(env.DB, [{
    name,
    artist: (body?.artist || '').trim(),
    genre: (body?.genre || '').trim(),
    url: trackUrl,
  }]);
  const track = await getTrackByUrl(env.DB, trackUrl);
  return json(env, track, 201);
}
