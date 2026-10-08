// ── Track routes ──────────────────────────────────────────────────────
//   GET  /api/tracks?genre=&limit=   list (optionally by genre)
//   POST /api/track                  { name, artist?, genre?, url } manual add

import { json, errorJson, readJson, nowIso } from '../utils/response.js';
import {
  listTracks, insertTracks, getTrackByUrl, canonicalYouTubeUrl, knownUrls,
  WALLET_RE, ensureWallet,
} from '../db/queries.js';
import { verifyOne, verifyConfig, idFromUrl } from '../services/oembed.js';
import { credit as contribCredit } from '../contrib.js';

export async function handleListTracks(request, env, url) {
  const genre = (url.searchParams.get('genre') || '').trim().slice(0, 100);
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

  // only YouTube video references may enter the catalogue; stored canonically
  const canonical = canonicalYouTubeUrl(trackUrl);
  if (!canonical) return errorJson(env, 'url must be a YouTube video link or 11-character id', 400);

  /* Looking like a YouTube url is not evidence that the video exists, and
     this endpoint is open to anyone. Ask YouTube before it joins a catalogue
     everybody else reads. One extra fetch, no API key, no quota — and the
     answer is cached at the edge, so a track other people have already added
     costs nothing.

     A video we can't reach a verdict on is stored unverified rather than
     refused: the catalogue hides it until something confirms it, which is the
     safe half of both outcomes. */
  const cfg = await verifyConfig(env);
  let verified = 0;
  if (cfg.enabled) {
    const seen = await knownUrls(env.DB, [canonical]);
    if (seen.get(canonical)) {
      verified = 1;                                  // already confirmed once
    } else {
      const verdict = await verifyOne(idFromUrl(canonical));
      if (!verdict.ok) {
        return errorJson(env, 'YouTube has no video at that link', 422, 'dead_link');
      }
      verified = verdict.unknown ? 0 : 1;
    }
  }

  /* Was this video already here? Asked BEFORE the insert, because the
     insert is NOT EXISTS and afterwards there is no way to tell the
     first person to add a track from the hundredth. Only the first is
     contributing anything. */
  const already = (await knownUrls(env.DB, [canonical])).get(canonical);

  await insertTracks(env.DB, [{
    name,
    artist: (body?.artist || '').trim(),
    genre: (body?.genre || '').trim(),
    url: canonical,
  }], 'paste', verified);
  const track = await getTrackByUrl(env.DB, canonical);

  /* A contribution point, if a wallet was offered and this was genuinely
     new and genuinely real. Unverified tracks score nothing: the whole
     basis of this reward is that the Worker asked YouTube itself and got
     an answer, so a video it could not reach a verdict on is not
     evidence of anything yet.

     The wallet is optional and the reward is best-effort — adding a
     track must never fail because the points table was unhappy. */
  let rewarded = 0;
  const wallet = String(body?.wallet || '');
  if (!already && verified && WALLET_RE.test(wallet)) {
    await ensureWallet(env.DB, wallet, nowIso());
    rewarded = await contribCredit(env, wallet, 'add', nowIso());
  }

  return json(env, { ...track, contributed: !already && !!verified, points: rewarded }, 201);
}
