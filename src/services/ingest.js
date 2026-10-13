// ── the one way tracks enter the catalogue from a list ────────────────
// Shared by saving a DJ AI set and sharing a mix, so the rule "nothing joins
// the catalogue unchecked" lives in exactly one place. It was inside
// routes/playlists.js; the text of the reasoning moved with it.
//
// Returns { ids, dropped, checked } — ids are track ids, in the order the
// rows were given, with anything YouTube denied left out — or
// { fail: [message, status, code?] } for the caller to turn into a response.

import {
  insertTracks, getTrackByUrl, canonicalYouTubeUrl, knownUrls, markVerified,
} from '../db/queries.js';
import { normalizeGenre } from '../genres.js';
import { verifyMany, verifyConfig, idFromUrl } from './oembed.js';

export async function ingestTracks(env, rows) {
  // canonical YouTube urls only — same choke point as every other write
  let clean = (rows || [])
    .map((t) => ({
      name: String(t?.name || '').trim().slice(0, 300),
      artist: String(t?.artist || '').trim().slice(0, 200),
      genre: String(t?.genre || '').trim().slice(0, 100),
      url: canonicalYouTubeUrl(t?.url || ''),
    }))
    .filter((t) => t.url);

  if (!clean.length) return { fail: ['No valid YouTube links', 400] };

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
      return { fail: ['None of those links point at a real YouTube video', 422, 'all_dead'] };
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
      const g = normalizeGenre(t.genre);
      await env.DB.prepare(
        `UPDATE tracks SET genre = ?2,
                           genre_raw = CASE WHEN genre_raw = '' THEN ?3 ELSE genre_raw END
          WHERE id = ?1 AND (genre = '' OR genre IS NULL)`)
        .bind(row.id, g.genre, g.raw).run();
    }
  }
  if (!ids.length) return { fail: ['Nothing could be saved', 400] };
  return { ids, dropped, checked };
}
