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
import {
  insertTracks, getTrackByUrl, canonicalYouTubeUrl, createPlaylist, addPlaylistTracks,
  knownUrls, markVerified,
} from '../db/queries.js';
import { verifyMany, verifyConfig, idFromUrl } from '../services/oembed.js';

const MAX_TRACKS = 50;

export async function handleSavePlaylist(request, env) {
  const body = await readJson(request);
  const name = String(body?.name || '').trim().slice(0, 200);
  const rows = Array.isArray(body?.tracks) ? body.tracks : null;

  if (!name) return errorJson(env, 'Missing playlist name', 400);
  if (!rows || !rows.length) return errorJson(env, 'Missing tracks', 400);
  if (rows.length > MAX_TRACKS) return errorJson(env, `Too many tracks (max ${MAX_TRACKS})`, 400);

  // canonical YouTube urls only — same choke point as every other write
  let clean = rows
    .map((t) => ({
      name: String(t?.name || '').trim().slice(0, 300),
      artist: String(t?.artist || '').trim().slice(0, 200),
      genre: String(t?.genre || '').trim().slice(0, 100),
      url: canonicalYouTubeUrl(t?.url || ''),
    }))
    .filter((t) => t.url);

  if (!clean.length) return errorJson(env, 'No valid YouTube links', 400);

  /* ── verify before anything joins the shared catalogue ───────────────
     The browser oEmbed-checks on import, but this endpoint is reachable
     without the browser, so the check has to exist here too.

     The budget is the thing to respect: a Worker on the free plan gets 50
     external subrequests per invocation, and a fifty-track set would spend
     all of them here and then fail on the next fetch. So:

       · urls the catalogue already holds as verified cost nothing (a D1
         read is not an external subrequest)
       · the rest are checked up to a cap well under the ceiling
       · anything YouTube denies is dropped from the set entirely
       · anything left unchecked is stored unverified — present, playable
         from this playlist, but invisible in the public catalogue until
         something confirms it

     The result is that no number of tracks can push the request over the
     limit, and no unverified row can reach the catalogue listings. */
  const cfg = await verifyConfig(env);
  let dropped = [];
  let checked = 0;
  let known = new Map();

  if (cfg.enabled) {
    known = await knownUrls(env.DB, clean.map((t) => t.url));
    const unconfirmed = clean.filter((t) => !known.get(t.url));
    const verdicts = await verifyMany(unconfirmed.map((t) => idFromUrl(t.url)), { max: cfg.maxChecks });
    checked = verdicts.size;

    const dead = new Set();
    for (const t of unconfirmed) {
      const v = verdicts.get(idFromUrl(t.url));
      if (v && !v.ok) dead.add(t.url);
    }
    dropped = clean.filter((t) => dead.has(t.url)).map((t) => t.name || t.url);
    clean = clean.filter((t) => !dead.has(t.url));
    if (!clean.length) {
      return errorJson(env, 'None of those links point at a real YouTube video', 422, 'all_dead');
    }

    // confirmed-good rows go in verified; everything else waits
    const good = new Set(
      unconfirmed.filter((t) => { const v = verdicts.get(idFromUrl(t.url)); return v && v.ok && !v.unknown; })
                 .map((t) => t.url)
    );
    await insertTracks(env.DB, clean.filter((t) => good.has(t.url) || known.get(t.url)), 'ai', 1);
    await insertTracks(env.DB, clean.filter((t) => !good.has(t.url) && !known.get(t.url)), 'ai', 0);
    await markVerified(env.DB, [...good]);
  } else {
    await insertTracks(env.DB, clean, 'ai', 0);
  }

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

  // say what was dropped and why — a set that silently came back shorter is
  // the kind of thing people notice three tracks later and never report
  return json(env, {
    id: playlistId, name, tracks: ids.length,
    ...(dropped.length ? { dropped } : {}),
    ...(checked ? { checked } : {}),
  }, 201);
}
