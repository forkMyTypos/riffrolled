// ── /api/mixes — sets meant to be shown to other people ───────────────
//
//   GET  /api/mixes?kind=premade|community&sort=new|popular&genre=&q=&limit=&offset=
//        q matches mix names and blurbs, the DJ choices, and the artists and titles of the tracks
//   GET  /api/mixes/:id                 the mix and its tracks, in order
//   POST /api/mixes/share               a listener shares a mix; may carry the DJ AI choices as `brief`.
//                                       `listed: false` makes it link-only (kind 'link': opened by its
//                                       link, never in a list); `showBy: true` shows "shared by rr·abc123"
//   GET  /api/mixes/mine                the mixes this wallet shared (needs the key), with their plays
//   POST /api/mixes/:id/play            a play, for the Popular sort
//   POST /api/mixes/:id/report          "this shouldn't be here"
//
// Premade mixes are written by the local admin tool straight into D1; there
// is deliberately no endpoint here that creates one (see routes/config.js
// for why riffrolled.com has no admin API at all).
//
// WHAT SHARING CAN AND CAN'T DO
// Anyone can call the share endpoint, so everything that makes a shared mix
// worth showing is enforced here, not trusted from the page:
//   · every track goes through the same link check as everything else
//     (services/ingest.js), and dead links are dropped
//   · a mix needs a few tracks (MIX_MIN_TRACKS) and a plain name — a name is
//     the one free-text field every visitor reads, so links and markup-ish
//     characters are refused rather than cleaned
//   · a limit per network address per day (MIX_SHARE_PER_DAY; 0 switches
//     sharing off). The address is hashed together with the date, so the
//     counter is not a record of anyone, and it is pruned after two days
//   · the same set of tracks can only be listed once
//   · a share needs a wallet key, and every wallet starts at sharing:false —
//     its Community mixes are kept as pending (in the database, listed nowhere) until
//     the owner looks at them in the admin tool and approves the key once;
//     after that its shares are listed straight away (MIX_SHARE_REVIEW;
//     off = no review). A key can have MAX_WAITING mixes waiting at a time.
//     Link-only mixes (sent to people, in no list) never wait, and can be
//     as short as one track
//   · enough different people reporting a mix hides it (MIX_REPORTS_TO_HIDE);
//     the owner can hide or restore any mix in the admin tool
// Play counts are anonymous and cheap to inflate; they order the Popular
// tab, they are not money and nothing pays out on them.

import { json, errorJson, readJson, nowIso } from '../utils/response.js';
import { getConfig } from '../config.js';
import { ingestTracks } from '../services/ingest.js';
import { normalizeGenre } from '../genres.js';
import { walletFrom } from '../wallet.js';
import { newMixSlug, SLUG_RE } from '../slug.js';

const MAX_TRACKS = 50;
const MAX_WAITING = 3;      // a not-yet-approved key's mixes in the queue at once
const LIST_MAX = 50;

async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Who, for a counter. Includes the day so it cannot be joined across days. */
async function whoToday(request, day) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'local';
  return (await sha256hex(ip + '|' + day)).slice(0, 32);
}

/** A name every visitor will read: plain text, no links, a sensible length. */
export function cleanName(raw) {
  const s = String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f<>`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length < 3 || s.length > 80) return '';
  if (/https?:|www\.|\.(com|net|org|io|ru|xyz)\b/i.test(s)) return '';
  if (!/[\p{L}\p{N}]/u.test(s)) return '';
  return s;
}

export function cleanBlurb(raw) {
  const s = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f<>`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  return /https?:|www\./i.test(s) ? '' : s;
}

/* THE BRIEF — what a mix was made from (the DJ AI choices).
   It arrives from the page (Share) or from the owner's admin tool, so it is
   rebuilt here from a whitelist rather than stored as sent: a handful of
   short plain-text picks, two numbers and a flag. Anything else is dropped.
   It is shown as chips and never as markup, and it holds no listening
   history — `sharedContext` (whether the listener let the AI see their
   library) is deliberately not part of it. */
const BRIEF_KEY = /^[a-z][a-z0-9_]{0,23}$/;
export function cleanBrief(raw) {
  let b = raw;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { return null; } }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const text = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const num = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
  const picks = {};
  const src = b.picks && typeof b.picks === 'object' && !Array.isArray(b.picks) ? b.picks : {};
  for (const k of Object.keys(src).slice(0, 12)) {
    if (!BRIEF_KEY.test(k)) continue;
    const v = text(src[k], 80);
    if (v && !/https?:|www\./i.test(v)) picks[k] = v;
  }
  const out = { picks };
  const fam = num(b.familiarity, 0, 100); if (fam !== null) out.familiarity = fam;
  const cnt = num(b.count, 3, 50);        if (cnt !== null) out.count = cnt;
  const min = num(b.minutes, 5, 600);     if (min !== null) out.minutes = min;
  const mx  = num(b.maxTrackMin, 1, 60);  if (mx !== null) out.maxTrackMin = mx;
  if (b.chaos === true || b.chaos === 1) out.chaos = true;
  for (const k of ['journey', 'avoid']) {      // free text the owner may add in the admin tool
    const v = text(b[k], 400);
    if (v && !/https?:|www\./i.test(v)) out[k] = v;
  }
  if (!Object.keys(picks).length && !('familiarity' in out) && !out.journey && !out.avoid) return null;
  return out;
}

/** One line of a DJ's reason for a track: plain text, no links, short. */
export function cleanNote(raw) {
  const s = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f<>`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
  return /https?:|www\./i.test(s) ? '' : s;
}

function briefOut(raw) {
  return cleanBrief(raw);          // stored JSON is re-cleaned on the way out too
}

/** The cover the admin tool chose: a bare 11-character video id, or nothing. */
function coverOf(m) {
  const c = String((m && m.cover) || '');
  return /^[A-Za-z0-9_-]{11}$/.test(c) ? c : '';
}

function ytId(url) {
  const m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(url || '');
  return m ? m[1] : '';
}

/** Shape a mix row for the browser. */
function shape(r, extra = {}) {
  return {
    id: r.id, kind: r.kind, name: r.name, blurb: r.blurb, genre: r.genre,
    tags: r.tags ? String(r.tags).split(',').map((s) => s.trim()).filter(Boolean) : [],
    tracks: r.tracks, plays: r.plays, created_at: r.created_at, slug: r.slug || '',
    by: byLine(r), ...extra,
  };
}

/** Who a mix is from, as listeners see it: riffrolled for premade mixes,
 *  "rr·" and the first six characters of the sharer's PUBLIC key when the
 *  sharer chose to show it, otherwise nothing. Never the private key, and
 *  never the whole public key. */
function byLine(r) {
  if (r.kind === 'premade') return 'riffrolled';
  const c = String(r.creator || '');
  return Number(r.show_by) === 1 && /^[0-9a-f]{64}$/.test(c) ? 'rr·' + c.slice(0, 6) : '';
}

/** Give any mix that has no share code one (mixes the admin tool wrote, or that
 *  pre-date schema 24). Done when a mix is read, so a link always exists. */
async function fillSlugs(env, rows) {
  for (const r of rows) {
    if (r.slug) continue;
    for (let tries = 0; tries < 6; tries++) {
      const s = newMixSlug();
      try {
        const done = await env.DB.prepare(`UPDATE mixes SET slug = ?2 WHERE id = ?1 AND slug = ''`).bind(r.id, s).run();
        r.slug = done.meta && done.meta.changes === 0
          ? ((await env.DB.prepare(`SELECT slug FROM mixes WHERE id = ?1`).bind(r.id).first()) || {}).slug || ''
          : s;
        break;
      } catch (err) { if (!/unique|constraint/i.test(String(err && err.message))) throw err; }
    }
  }
}

// ── GET /api/mixes ────────────────────────────────────────────────────
export async function handleListMixes(request, env, url) {
  const kind = url.searchParams.get('kind') === 'premade' ? 'premade' : 'community';
  const sort = url.searchParams.get('sort') === 'popular' ? 'popular' : 'new';
  const genre = normalizeGenre(url.searchParams.get('genre') || '').genre;
  const q = String(url.searchParams.get('q') || '').trim().slice(0, 60);
  const limit = Math.max(1, Math.min(LIST_MAX, parseInt(url.searchParams.get('limit') || '30', 10) || 30));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
  const like = '%' + q.replace(/([%_\\])/g, '\\$1') + '%';

  // premade: the order you chose in the admin tool; community: new or popular
  const order = kind === 'premade' ? 'm.sort ASC, m.id DESC'
    : sort === 'popular' ? 'm.plays DESC, m.id DESC' : 'm.id DESC';

  const { results } = await env.DB.prepare(
    `SELECT m.id, m.kind, m.name, m.blurb, m.genre, m.tags, m.plays, m.created_at, m.slug,
            m.creator, m.show_by, m.cover,
            (SELECT COUNT(*) FROM mix_tracks mt WHERE mt.mix_id = m.id) AS tracks
       FROM mixes m
      WHERE m.kind = ?1 AND m.hidden = 0 AND m.pending = 0
        AND (?2 = '' OR m.genre = ?2)
        AND (?3 = '' OR m.name LIKE ?4 ESCAPE '\\' OR m.blurb LIKE ?4 ESCAPE '\\'
             -- the DJ choices are JSON: match their VALUES ("Road trip", "The Crate
             -- Digger"), never the keys, so "picks" or "count" can't match everything
             OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(m.brief) THEN m.brief ELSE '{}' END, '$.picks') je
                         WHERE je.value LIKE ?4 ESCAPE '\\')
             OR EXISTS (SELECT 1 FROM mix_tracks st JOIN tracks tt ON tt.id = st.track_id
                         WHERE st.mix_id = m.id AND (tt.artist LIKE ?4 ESCAPE '\\' OR tt.name LIKE ?4 ESCAPE '\\')))
      ORDER BY ${order} LIMIT ?5 OFFSET ?6`
  ).bind(kind, genre, q, like, limit, offset).all();
  const mixes = results || [];
  await fillSlugs(env, mixes);

  // a small taste of each: the first few artists and the first video, for a cover
  const taste = new Map();
  if (mixes.length) {
    const marks = mixes.map((_, i) => '?' + (i + 1)).join(', ');
    const { results: peek } = await env.DB.prepare(
      `SELECT mt.mix_id, mt.position, t.artist, t.url
         FROM mix_tracks mt JOIN tracks t ON t.id = mt.track_id
        WHERE mt.mix_id IN (${marks}) AND mt.position < 8
        ORDER BY mt.mix_id, mt.position`
    ).bind(...mixes.map((m) => m.id)).all();
    for (const p of peek || []) {
      const e = taste.get(p.mix_id) || { cover: '', artists: [] };
      if (!e.cover) e.cover = ytId(p.url);
      if (p.artist && !e.artists.includes(p.artist) && e.artists.length < 3) e.artists.push(p.artist);
      taste.set(p.mix_id, e);
    }
  }

  return json(env, {
    kind, sort, offset,
    mixes: mixes.map((m) => shape(m, { cover: coverOf(m) || (taste.get(m.id) || {}).cover || '', artists: (taste.get(m.id) || {}).artists || [] })),
  }, 200, { 'Cache-Control': 'public, max-age=30' });
}

// ── GET /api/mixes/:id-or-code ────────────────────────────────────────
// A row number (what the lists use) or an 8-character share code (what a
// shared link carries). A mix that is hidden, waiting for approval or gone is
// not found by either.
export async function handleGetMix(request, env, url) {
  const key = url.pathname.split('/')[3] || '';
  const bySlug = SLUG_RE.test(key) && !/^\d{1,7}$/.test(key);
  const id = bySlug ? 0 : parseInt(key, 10);
  if (!bySlug && !id) return errorJson(env, 'No such mix', 404);
  const m = await env.DB.prepare(
    `SELECT id, kind, name, blurb, genre, tags, plays, created_at, brief, slug, creator, show_by, cover FROM mixes
      WHERE ${bySlug ? 'slug = ?1' : 'id = ?1'} AND hidden = 0 AND pending = 0`
  ).bind(bySlug ? key : id).first();
  if (!m) return errorJson(env, 'No such mix', 404);
  await fillSlugs(env, [m]);
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.name, t.artist, t.genre, t.url, mt.note
       FROM mix_tracks mt JOIN tracks t ON t.id = mt.track_id
      WHERE mt.mix_id = ?1 ORDER BY mt.position`
  ).bind(m.id).all();
  const tracks = (results || []).map((t) => ({ ...t, note: cleanNote(t.note), ytId: ytId(t.url) })).filter((t) => t.ytId);
  return json(env, { ...shape({ ...m, tracks: tracks.length }), cover: coverOf(m) || (tracks[0] ? tracks[0].ytId : ''),
                     brief: briefOut(m.brief), items: tracks }, 200, { 'Cache-Control': 'public, max-age=30' });
}

// ── POST /api/mixes/share ─────────────────────────────────────────────
export async function handleShareMix(request, env) {
  const cfg = await getConfig(env);
  if (!cfg.MIX_SHARE_PER_DAY) return errorJson(env, 'Sharing mixes is switched off right now', 503, 'sharing_off');

  const body = await readJson(request);
  const name = cleanName(body && body.name);
  if (!name) return errorJson(env, 'Give the mix a plain name, 3–80 characters, without links', 400, 'bad_name');
  const rows = Array.isArray(body && body.tracks) ? body.tracks : null;
  /* listed (Community) or link-only (sent to people). A link-only mix is in
     no list, so it needs no approval and no minimum length: sending a friend
     a two-track playlist should just work. Community still waits for the
     owner's OK the first time, and needs MIX_MIN_TRACKS. */
  const listed = !(body && body.listed === false);
  const minTracks = listed ? cfg.MIX_MIN_TRACKS : 1;
  if (!rows || !rows.length) return errorJson(env, 'Missing tracks', 400);
  if (rows.length > MAX_TRACKS) return errorJson(env, `Too many tracks (max ${MAX_TRACKS})`, 400);
  if (rows.length < minTracks) return errorJson(env, `A mix needs at least ${minTracks} tracks`, 422, 'too_short');

  // the sharer's PUBLIC key, from the private key the page sends; logged for
  // the owner, never shown to listeners. No key, no share: approval is per key
  const creator = (await walletFrom(env, request, body, null)) || '';
  if (!creator) return errorJson(env, 'Sharing needs your wallet key — reload the page and try again', 401, 'needs_key');

  // has the owner OK'd this key? (0 = not yet, 1 = yes, -1 = blocked)
  const sharer = await env.DB.prepare(`SELECT sharing FROM sharers WHERE pub = ?1`).bind(creator).first();
  const sharing = sharer ? Number(sharer.sharing) : 0;
  if (sharing < 0) return errorJson(env, 'This key can’t share mixes', 403, 'sharing_blocked');
  const review = listed && cfg.MIX_SHARE_REVIEW && sharing !== 1;
  if (review) {
    const waiting = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM mixes WHERE creator = ?1 AND pending = 1`
    ).bind(creator).first();
    if ((waiting?.n || 0) >= MAX_WAITING) {
      return errorJson(env, `You’ve ${MAX_WAITING} mixes waiting for a quick check already — they’ll go up once your key is approved`, 429, 'waiting_full');
    }
  }

  // the daily allowance, counted before any paid-for work happens
  const day = nowIso().slice(0, 10);
  const who = await whoToday(request, day);
  const mine = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM mixes WHERE creator = ?1 AND created_at >= ?2`
  ).bind(creator, day).first();
  if ((mine?.n || 0) >= cfg.MIX_SHARE_PER_DAY) {
    return errorJson(env, `That’s ${cfg.MIX_SHARE_PER_DAY} mixes shared today — try again tomorrow`, 429, 'daily_limit');
  }
  const used = await env.DB.prepare(`SELECT n FROM mix_shares WHERE day = ?1 AND who = ?2`).bind(day, who).first();
  if ((used?.n || 0) >= cfg.MIX_SHARE_PER_DAY) {
    return errorJson(env, `That’s ${cfg.MIX_SHARE_PER_DAY} mixes shared today — try again tomorrow`, 429, 'daily_limit');
  }

  // an attempt counts, successful or not: checking links is the expensive part
  await env.DB.prepare(
    `INSERT INTO mix_shares (day, who, n) VALUES (?1, ?2, 1)
     ON CONFLICT(day, who) DO UPDATE SET n = n + 1`
  ).bind(day, who).run();

  const got = await ingestTracks(env, rows);
  if (got.fail) return errorJson(env, got.fail[0], got.fail[1], got.fail[2]);
  const { ids, dropped } = got;
  if (ids.length < minTracks) {
    return errorJson(env, `Only ${ids.length} of those tracks are real YouTube videos — a mix needs ${minTracks}`, 422, 'too_short');
  }

  // the same tracks in the same order are the same mix, whatever it is called
  const fingerprint = (await sha256hex(ids.join(','))).slice(0, 32);
  const showBy = !!(body && body.showBy === true);
  const existing = await env.DB.prepare(`SELECT id, name, pending, slug, kind, creator FROM mixes WHERE fingerprint = ?1`).bind(fingerprint).first();
  if (existing) {
    /* The same tracks were shared before. If it was link-only and is now
       being shared with everyone, by the same key, it moves into the
       Community list; nothing else about it changes. */
    let pending = Number(existing.pending) === 1;
    if (listed && existing.kind === 'link' && existing.creator === creator) {
      // going public: a key that hasn't been OK'd yet waits, like any Community share
      if (review) pending = true;
      await env.DB.prepare(`UPDATE mixes SET kind = 'community', pending = ?2 WHERE id = ?1`).bind(existing.id, pending ? 1 : 0).run();
    }
    await fillSlugs(env, [existing]);
    return json(env, { id: existing.id, name: existing.name, slug: existing.slug, tracks: ids.length, existing: true,
                       listed: listed || existing.kind !== 'link', ...(pending ? { pending: true } : {}) });
  }

  const genre = normalizeGenre(body.genre || '').genre;
  // the DJ AI choices travel only if the listener ticked the box (page side);
  // either way they are rebuilt from a whitelist, never stored as sent
  const brief = cleanBrief(body.brief);
  const slug = newMixSlug();
  const res = await env.DB.prepare(
    `INSERT INTO mixes (kind, name, blurb, genre, fingerprint, created_at, brief, creator, pending, slug, show_by)
     VALUES (?10, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?11)`
  ).bind(name, cleanBlurb(body.blurb), genre, fingerprint, nowIso(), brief ? JSON.stringify(brief) : '', creator, review ? 1 : 0, slug,
         listed ? 'community' : 'link', showBy ? 1 : 0).run();
  const mixId = res.meta.last_row_id;
  const stmt = env.DB.prepare(`INSERT INTO mix_tracks (mix_id, track_id, position) VALUES (?1, ?2, ?3)`);
  await env.DB.batch(ids.map((tid, i) => stmt.bind(mixId, tid, i)));
  // the first time a key shares, it gets its row (sharing:false) — that is
  // what puts it in front of the owner in the admin tool
  await env.DB.prepare(`INSERT OR IGNORE INTO sharers (pub, sharing, first_at) VALUES (?1, 0, ?2)`)
    .bind(creator, nowIso()).run();

  return json(env, { id: mixId, name, slug, tracks: ids.length, listed, ...(review ? { pending: true } : {}),
                     ...(dropped.length ? { dropped } : {}) }, review ? 202 : 201);
}

// ── GET /api/mixes/mine ───────────────────────────────────────────────
// The sharer's own mixes, listed or link-only, waiting or not, with their
// play counts: the reason to send the link to someone. Needs the wallet key
// (the page sends it in a header); returns nothing for anyone else.
export async function handleMyMixes(request, env) {
  const creator = (await walletFrom(env, request, null, null)) || '';
  if (!creator) return errorJson(env, 'Needs your wallet key', 401, 'needs_key');
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.kind, m.name, m.blurb, m.genre, m.tags, m.plays, m.created_at, m.slug, m.pending, m.hidden,
            m.creator, m.show_by,
            (SELECT COUNT(*) FROM mix_tracks mt WHERE mt.mix_id = m.id) AS tracks
       FROM mixes m WHERE m.creator = ?1 ORDER BY m.id DESC LIMIT 50`
  ).bind(creator).all();
  const rows = results || [];
  await fillSlugs(env, rows);
  return json(env, { mixes: rows.map((m) => shape(m, { pending: Number(m.pending) === 1, hidden: Number(m.hidden) === 1 })) },
              200, { 'Cache-Control': 'no-store' });
}

// ── POST /api/mixes/:id/play ──────────────────────────────────────────
export async function handleMixPlay(request, env, url) {
  const id = parseInt(url.pathname.split('/')[3], 10);
  if (!id) return errorJson(env, 'No such mix', 404);
  await env.DB.prepare(`UPDATE mixes SET plays = plays + 1 WHERE id = ?1 AND hidden = 0 AND pending = 0`).bind(id).run();
  return json(env, { ok: true });
}

// ── POST /api/mixes/:id/report ────────────────────────────────────────
export async function handleMixReport(request, env, url) {
  const id = parseInt(url.pathname.split('/')[3], 10);
  if (!id) return errorJson(env, 'No such mix', 404);
  const cfg = await getConfig(env);
  const m = await env.DB.prepare(`SELECT id, kind FROM mixes WHERE id = ?1`).bind(id).first();
  if (!m) return errorJson(env, 'No such mix', 404);
  const who = await whoToday(request, 'reports');         // one report per person per mix, ever
  await env.DB.prepare(`INSERT OR IGNORE INTO mix_reports (mix_id, who, created_at) VALUES (?1, ?2, ?3)`)
    .bind(id, who, nowIso()).run();
  const n = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM mix_reports WHERE mix_id = ?1`).bind(id).first())?.n || 0;
  await env.DB.prepare(`UPDATE mixes SET reports = ?2 WHERE id = ?1`).bind(id, n).run();
  // a shared mix (listed or link-only) hides itself; a premade one is yours to judge
  let hidden = false;
  if (m.kind !== 'premade' && n >= cfg.MIX_REPORTS_TO_HIDE) {
    await env.DB.prepare(`UPDATE mixes SET hidden = 1 WHERE id = ?1`).bind(id).run();
    hidden = true;
  }
  return json(env, { ok: true, hidden });
}
