// ── POST /api/playlist/save ───────────────────────────────────────────
// The tracks of a DJ AI set join the shared catalogue: tracks that are new
// are added (source='ai') with whatever the AI told us — name, artist,
// genre — so the catalogue grows with every set anyone builds.
//
// The set itself is NOT kept here. It used to be (its name and track ids,
// anonymously), but nothing ever read it back; the listener's playlist
// lives in their own browser (Dexie), which is where playlists belong.
// Schema 29 dropped the old tables.
//
// Deliberately anonymous: no wallet, no device id, no listener.
// Nothing here touches the YouTube API beyond what ingest does.

import { json, errorJson, readJson } from '../utils/response.js';
import { ingestTracks } from '../services/ingest.js';

const MAX_TRACKS = 50;

/**
 * POST /api/playlist/save — add a set's tracks to the catalogue.
 * Body: { name, tracks: [{ name, artist, genre, url }] }
 * Returns { name, tracks, dropped?, checked? }
 */
export async function handleSavePlaylist(request, env) {
  const body = await readJson(request);
  const name = String(body?.name || '').trim().slice(0, 200);
  const rows = Array.isArray(body?.tracks) ? body.tracks : null;

  if (!rows || !rows.length) return errorJson(env, 'Missing tracks', 400);
  if (rows.length > MAX_TRACKS) return errorJson(env, `Too many tracks (max ${MAX_TRACKS})`, 400);

  const got = await ingestTracks(env, rows);
  if (got.fail) return errorJson(env, got.fail[0], got.fail[1], got.fail[2]);
  const { ids, dropped, checked } = got;

  // say what was dropped and why — a set that silently came back shorter is
  // the kind of thing people notice three tracks later and never report
  return json(env, {
    name, tracks: ids.length,
    ...(dropped.length ? { dropped } : {}),
    ...(checked ? { checked } : {}),
  }, 201);
}
