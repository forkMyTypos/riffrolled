// ── GET /api/channel?input=…&limit=… ──────────────────────────────────
// Server-side channel import: resolve the channel, pull its uploads
// (cheap playlistItems calls), insert into D1 (deduped by url), return
// the tracks. The frontend mirrors them into its local library/playlist.

import { json, errorJson } from '../utils/response.js';
import { insertTracks, countTracks } from '../db/queries.js';
import { resolveChannel, fetchChannelUploads, parsePlaylistId, getPlaylistTitle, YouTubeError } from '../services/youtube.js';

export async function handleChannelImport(request, env, url) {
  const input = (url.searchParams.get('input') || '').trim();
  if (!input) return errorJson(env, 'Missing query parameter: input', 400);
  if (input.length > 300) return errorJson(env, 'Input too long', 400);

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 2000); // 'All' = up to 2000 (40 cheap playlistItems pages)

  try {
    const channel = await resolveChannel(env, input);
    const tracks = await fetchChannelUploads(env, channel.uploadsPlaylistId, limit);

    const before = await countTracks(env.DB);
    if (tracks.length) await insertTracks(env.DB, tracks);
    const added = (await countTracks(env.DB)) - before;

    return json(env, {
      channel: channel.title,
      fetched: tracks.length,
      added,                       // how many were new to the shared database
      tracks,                      // full list so the client can mirror locally
    });
  } catch (err) {
    if (err instanceof YouTubeError) return errorJson(env, err.message, err.status, err.kind);
    throw err;
  }
}

/**
 * GET /api/playlist?list=…&limit=…
 * Imports any public YouTube playlist. Same machinery (and same cheap
 * playlistItems calls) as channel import — a channel import is just the
 * channel's uploads playlist, so this is the general case.
 */
export async function handlePlaylistImport(request, env, url) {
  const raw = (url.searchParams.get('list') || '').trim();
  if (!raw) return errorJson(env, 'Missing query parameter: list', 400);
  if (raw.length > 300) return errorJson(env, 'Input too long', 400);

  const listId = parsePlaylistId(raw);
  if (!listId) {
    return errorJson(env, 'That is not a playlist link. YouTube “Mix”/radio playlists can’t be imported.', 400);
  }

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 2000);

  try {
    const title = await getPlaylistTitle(env, listId);
    if (!title) return errorJson(env, 'Playlist not found — it may be private or unlisted', 404);

    const tracks = await fetchChannelUploads(env, listId, limit);   // works for any playlist id

    const before = await countTracks(env.DB);
    if (tracks.length) await insertTracks(env.DB, tracks);
    const added = (await countTracks(env.DB)) - before;

    return json(env, { channel: title, fetched: tracks.length, added, tracks });
  } catch (err) {
    if (err instanceof YouTubeError) return errorJson(env, err.message, err.status, err.kind);
    throw err;
  }
}
