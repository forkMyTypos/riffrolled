// ── POST /api/stats ───────────────────────────────────────────────────
// One batched, anonymous summary of what happened on a device: which
// tracks were played, liked or disliked.
//
// WHAT THIS DELIBERATELY DOES NOT CARRY: no wallet, no device id, no
// session id, no timestamps per event, no order. The body is a tally, not
// a history, and the server stores it by adding to counters — so riffrolled
// learns that a track was played 40 times today and never learns that you
// played it. That is the same promise info.js already makes about promo
// events, extended to the rest of the site rather than quietly dropped the
// moment the reward engine wanted data.
//
// Links between tracks (RELATED, PLAY_ORDER) live only in the listener's
// browser (Dexie). The server copy and POST /api/link were removed in
// schema 29: nothing on the site ever sent one. An old client's
// `linkFollows` is accepted and ignored.
//
// ── HONEST LIMITATION, AND WHAT WAS DONE ABOUT IT ────────────────────
// These counters are inflatable. There is no wallet on the request and no
// way for the server to tell a real listener from a loop, which is fine
// for ranking a catalogue and showing a promoter roughly how a track is
// doing — exactly what info.js already says about promotion stats.
//
// It is NOT fine as the basis for paying anybody, and this note used to
// say "do not wire a ledger credit to these numbers". That still holds,
// and nothing does: the contribution rewards in src/contrib.js are paid
// from signals the Worker observed itself — that it asked YouTube whether
// a video exists and got an answer, and that the insert was the first for
// that video — and from a fixed pool, so no amount of forged activity
// creates a credit. Not one line of this file feeds a payout.
//
// If consumption ever does need to earn, it needs evidence the browser
// cannot manufacture: a server-issued, single-use listening token,
// redeemed with proof of work so that faking a play costs the same CPU
// that minting a credit costs. Raising that bar is the only honest way,
// and it taxes every real listener's battery to do it — which is why the
// rewards that exist today deliberately pay for contribution instead.

import { json, errorJson, readJson } from '../utils/response.js';
import { canonicalYouTubeUrl } from '../db/queries.js';

/* Caps. Not security — an attacker just sends more requests — but they keep
   one accidental loop from doing real damage, bound the D1 write cost of a
   single call, and make the shape of a legitimate batch explicit. */
const MAX_TRACKS = 60;          // distinct tracks in one batch
const MAX_PER_TRACK = 50;       // plays of one track in one batch

const ytUrl = (id) => canonicalYouTubeUrl(String(id || '').trim());

/** `{ ytId: count }` → a clean Map, dropping anything malformed. */
function tally(obj) {
  const out = new Map();
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [id, raw] of Object.entries(obj)) {
    if (out.size >= MAX_TRACKS) break;
    const url = ytUrl(id);
    if (!url) continue;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n <= 0) continue;
    out.set(url, Math.min(n, MAX_PER_TRACK));
  }
  return out;
}

export async function handleStats(request, env) {
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return errorJson(env, 'Expected a JSON body', 400);

  const plays = tally(body.plays);
  const likes = tally(body.likes);
  const dislikes = tally(body.dislikes);

  if (!plays.size && !likes.size && !dislikes.size) {
    return json(env, { ok: true, counted: 0 });
  }

  const stmts = [];
  const bump = (col, map) => {
    if (!map.size) return;
    // Only ever adds. A counter that can go down is a counter somebody can
    // use to erase evidence.
    const s = env.DB.prepare(`UPDATE tracks SET ${col} = ${col} + ?2 WHERE url = ?1`);
    for (const [url, n] of map) stmts.push(s.bind(url, n));
  };
  bump('plays', plays);
  bump('likes', likes);
  bump('dislikes', dislikes);

  await env.DB.batch(stmts);
  return json(env, {
    ok: true,
    counted: plays.size + likes.size + dislikes.size,
  });
}

/* `${col}` above is interpolated, which is only safe because the three call
   sites pass literals. It is never reachable from the request body. */
