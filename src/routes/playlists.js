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
import { insertTracks, getTrackByUrl, canonicalYouTubeUrl, createPlaylist, addPlaylistTracks } from '../db/queries.js';

const MAX_TRACKS = 50;

export async function handleSavePlaylist(request, env) {
  const body = await readJson(request);
  const name = String(body?.name || '').trim().slice(0, 200);
  const rows = Array.isArray(body?.tracks) ? body.tracks : null;

  if (!name) return errorJson(env, 'Missing playlist name', 400);
  if (!rows || !rows.length) return errorJson(env, 'Missing tracks', 400);
  if (rows.length > MAX_TRACKS) return errorJson(env, `Too many tracks (max ${MAX_TRACKS})`, 400);

  // canonical YouTube urls only — same choke point as every other write
  const clean = rows
    .map((t) => ({
      name: String(t?.name || '').trim().slice(0, 300),
      artist: String(t?.artist || '').trim().slice(0, 200),
      genre: String(t?.genre || '').trim().slice(0, 100),
      url: canonicalYouTubeUrl(t?.url || ''),
    }))
    .filter((t) => t.url);

  if (!clean.length) return errorJson(env, 'No valid YouTube links', 400);

  // new tracks join the catalogue; existing rows are left exactly as they are
  await insertTracks(env.DB, clean, 'ai');

  const ids = [];
  for (const t of clean) {
    const row = await getTrackByUrl(env.DB, t.url);
    if (!row) continue;
    ids.push(row.id);
    // fill a blank genre from what the AI said; never overwrite one a
    // person has set
    if (t.genre && !row.genre) {
      await env.DB.prepare(`UPDATE tracks SET genre = ?2 WHERE id = ?1 AND (genre = '' OR genre IS NULL)`)
        .bind(row.id, t.genre).run();
    }
  }
  if (!ids.length) return errorJson(env, 'Nothing could be saved', 400);

  const source = String(body?.source || 'ai').slice(0, 20);
  const playlistId = await createPlaylist(env.DB, name, source, nowIso());
  await addPlaylistTracks(env.DB, playlistId, ids);

  return json(env, { id: playlistId, name, tracks: ids.length }, 201);
}
