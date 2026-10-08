// ── POST /api/stats ───────────────────────────────────────────────────
// One batched, anonymous summary of what happened on a device: which
// tracks were played, liked or disliked, and which links were followed.
//
// WHAT THIS DELIBERATELY DOES NOT CARRY: no wallet, no device id, no
// session id, no timestamps per event, no order. The body is a tally, not
// a history, and the server stores it by adding to counters — so riffrolled
// learns that a track was played 40 times today and never learns that you
// played it. That is the same promise info.js already makes about promo
// events, extended to the rest of the site rather than quietly dropped the
// moment the reward engine wanted data.
//
// The one exception is `links`, where `created_by` records who MADE a link.
// Authorship is on the contribution; consumption stays anonymous.
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

import { json, errorJson, readJson, nowIso } from '../utils/response.js';
import { canonicalYouTubeUrl, WALLET_RE, ensureWallet } from '../db/queries.js';
import { credit as contribCredit } from '../contrib.js';

/* Caps. Not security — an attacker just sends more requests — but they keep
   one accidental loop from doing real damage, bound the D1 write cost of a
   single call, and make the shape of a legitimate batch explicit. */
const MAX_TRACKS = 60;          // distinct tracks in one batch
const MAX_PER_TRACK = 50;       // plays of one track in one batch
const MAX_LINKS = 40;
const LINK_TYPES = new Set(['RELATED', 'PLAY_ORDER']);

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

  const follows = [];
  if (Array.isArray(body.linkFollows)) {
    for (const f of body.linkFollows.slice(0, MAX_LINKS)) {
      const type = String(f && f.type || '').toUpperCase();
      if (!LINK_TYPES.has(type)) continue;
      const a = String(f && f.a || '').trim();
      const b = String(f && f.b || '').trim();
      if (!/^[A-Za-z0-9_-]{11}$/.test(a) || !/^[A-Za-z0-9_-]{11}$/.test(b) || a === b) continue;
      // RELATED is undirected, so its key sorts; PLAY_ORDER keeps direction
      const [x, y] = type === 'PLAY_ORDER' ? [a, b] : [a, b].sort();
      follows.push({ key: `${type}|${x}|${y}`, type, a: x, b: y });
    }
  }

  if (!plays.size && !likes.size && !dislikes.size && !follows.length) {
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

  if (follows.length) {
    const f = env.DB.prepare(`UPDATE links SET follows = follows + 1, last_ts = ?2 WHERE key = ?1`);
    const at = nowIso();
    // A follow of a link nobody has pushed to the server yet simply does
    // nothing — the link's own row arrives when its maker publishes it.
    for (const l of follows) stmts.push(f.bind(l.key, at));
  }

  await env.DB.batch(stmts);
  return json(env, {
    ok: true,
    counted: plays.size + likes.size + dislikes.size + follows.length,
  });
}

/* `${col}` above is interpolated, which is only safe because the three call
   sites pass literals. It is never reachable from the request body. */

// ── POST /api/link ────────────────────────────────────────────────────
// Someone says two tracks belong together. This is the ONE call in step 2
// that carries a wallet, because a manual link has an author and the whole
// point of recording it is that its maker can later be credited when other
// people follow it.
//
// Only manual links. riffrolled's own observations (PLAY_ORDER from the
// player) stay local — nobody authored them, so nobody is owed for them,
// and shipping every listener's play sequence to the server is exactly the
// history this design refuses to collect.


const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export async function handleLink(request, env) {
  const body = await readJson(request);
  const wallet = String(body && body.wallet || '');
  if (!WALLET_RE.test(wallet)) return errorJson(env, 'Bad wallet key', 400);

  const a = String(body && body.a || '').trim();
  const b = String(body && body.b || '').trim();
  if (!ID_RE.test(a) || !ID_RE.test(b)) return errorJson(env, 'Two YouTube video ids are required', 400);
  if (a === b) return errorJson(env, 'A track cannot be linked to itself', 400);

  // RELATED is the only type a person can author; sorted, so A→B and B→A
  // are the same link rather than two half-rows
  const [x, y] = [a, b].sort();
  const key = `RELATED|${x}|${y}`;
  const now = nowIso();

  await ensureWallet(env.DB, wallet, now);

  // First author wins. A second person linking the same pair is agreement,
  // not a competing claim, and overwriting would let anyone take credit for
  // somebody else's link by re-submitting it.
  const res = await env.DB.prepare(
    `INSERT INTO links (key, type, a, b, origin, created_by, follows, first_ts, last_ts)
     VALUES (?1, 'RELATED', ?2, ?3, 'manual', ?4, 0, ?5, ?5)
       ON CONFLICT(key) DO NOTHING`
  ).bind(key, x, y, wallet, now).run();

  const created = !!(res.meta && res.meta.changes);

  /* A point for publishing a link nobody had published. Only on create:
     agreeing with an existing link is not a contribution, and paying for
     it would make re-submitting other people's links the cheapest way to
     earn. Best-effort, like the track reward — a link that is made must
     never fail because the points table was unhappy. */
  let points = 0;
  if (created) points = await contribCredit(env, wallet, 'link', now);

  return json(env, { ok: true, created, key, points }, created ? 201 : 200);
}
