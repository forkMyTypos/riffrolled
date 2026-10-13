// ── POST /api/playlist/save ───────────────────────────────────────────
// A DJ AI set, kept by riffrolled itself: the playlist's name and the ids
// of its tracks, nothing more. Tracks that are new to the catalogue are
// added on the way through (source='ai'), with whatever the AI told us —
// name, artist, genre — so the shared catalogue grows with every set
// anyone builds.
//
// Deliberately anonymous: no wallet, no device id, no listener. The row
// says "this set exists and these tracks were in this order", which is
// what makes it useful later (what tends to sit alongside what) without
// it becoming anybody's listening history.
//
// Nothing here touches the YouTube API. The AI verified its own links;
// this is our own database.

import { json, errorJson, readJson, nowIso } from '../utils/response.js';
import { createPlaylist, addPlaylistTracks } from '../db/queries.js';
import { ingestTracks } from '../services/ingest.js';

const MAX_TRACKS = 50;

export async function handleSavePlaylist(request, env) {
  const body = await readJson(request);
  const name = String(body?.name || '').trim().slice(0, 200);
  const rows = Array.isArray(body?.tracks) ? body.tracks : null;

  if (!name) return errorJson(env, 'Missing playlist name', 400);
  if (!rows || !rows.length) return errorJson(env, 'Missing tracks', 400);
  if (rows.length > MAX_TRACKS) return errorJson(env, `Too many tracks (max ${MAX_TRACKS})`, 400);

  const got = await ingestTracks(env, rows);
  if (got.fail) return errorJson(env, got.fail[0], got.fail[1], got.fail[2]);
  const { ids, dropped, checked } = got;

  const source = String(body?.source || 'ai').slice(0, 20);
  const playlistId = await createPlaylist(env.DB, name, source, nowIso());
  await addPlaylistTracks(env.DB, playlistId, ids);

  // say what was dropped and why — a set that silently came back shorter is
  // the kind of thing people notice three tracks later and never report
  return json(env, {
    id: playlistId, name, tracks: ids.length,
    ...(dropped.length ? { dropped } : {}),
    ...(checked ? { checked } : {}),
  }, 201);
}
