// ── /api/mixes — sets meant to be shown to other people ───────────────
//
//   GET  /api/mixes?kind=premade|community&sort=new|popular&genre=&q=&limit=&offset=
//   GET  /api/mixes/:id                 the mix and its tracks, in order
//   POST /api/mixes/share               a listener shares a mix (community)
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
//   · enough different people reporting a mix hides it (MIX_REPORTS_TO_HIDE);
//     the owner can hide or restore any mix in the admin tool
// Play counts are anonymous and cheap to inflate; they order the Popular
// tab, they are not money and nothing pays out on them.

import { json, errorJson, readJson, nowIso } from '../utils/response.js';
import { getConfig } from '../config.js';
import { ingestTracks } from '../services/ingest.js';
import { normalizeGenre } from '../genres.js';

const MAX_TRACKS = 50;
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

function ytId(url) {
  const m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(url || '');
  return m ? m[1] : '';
}

/** Shape a mix row for the browser. */
function shape(r, extra = {}) {
  return {
    id: r.id, kind: r.kind, name: r.name, blurb: r.blurb, genre: r.genre,
    tags: r.tags ? String(r.tags).split(',').map((s) => s.trim()).filter(Boolean) : [],
    tracks: r.tracks, plays: r.plays, created_at: r.created_at, ...extra,
  };
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
    `SELECT m.id, m.kind, m.name, m.blurb, m.genre, m.tags, m.plays, m.created_at,
            (SELECT COUNT(*) FROM mix_tracks mt WHERE mt.mix_id = m.id) AS tracks
       FROM mixes m
      WHERE m.kind = ?1 AND m.hidden = 0
        AND (?2 = '' OR m.genre = ?2)
        AND (?3 = '' OR m.name LIKE ?4 ESCAPE '\\' OR m.blurb LIKE ?4 ESCAPE '\\')
      ORDER BY ${order} LIMIT ?5 OFFSET ?6`
  ).bind(kind, genre, q, like, limit, offset).all();
  const mixes = results || [];

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
    mixes: mixes.map((m) => shape(m, { cover: (taste.get(m.id) || {}).cover || '', artists: (taste.get(m.id) || {}).artists || [] })),
  }, 200, { 'Cache-Control': 'public, max-age=30' });
}

// ── GET /api/mixes/:id ────────────────────────────────────────────────
export async function handleGetMix(request, env, url) {
  const id = parseInt(url.pathname.split('/')[3], 10);
  if (!id) return errorJson(env, 'No such mix', 404);
  const m = await env.DB.prepare(
    `SELECT id, kind, name, blurb, genre, tags, plays, created_at FROM mixes WHERE id = ?1 AND hidden = 0`
  ).bind(id).first();
  if (!m) return errorJson(env, 'No such mix', 404);
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.name, t.artist, t.genre, t.url
       FROM mix_tracks mt JOIN tracks t ON t.id = mt.track_id
      WHERE mt.mix_id = ?1 ORDER BY mt.position`
  ).bind(id).all();
  const tracks = (results || []).map((t) => ({ ...t, ytId: ytId(t.url) })).filter((t) => t.ytId);
  return json(env, { ...shape({ ...m, tracks: tracks.length }), items: tracks }, 200, { 'Cache-Control': 'public, max-age=30' });
}

// ── POST /api/mixes/share ─────────────────────────────────────────────
export async function handleShareMix(request, env) {
  const cfg = await getConfig(env);
  if (!cfg.MIX_SHARE_PER_DAY) return errorJson(env, 'Sharing mixes is switched off right now', 503, 'sharing_off');

  const body = await readJson(request);
  const name = cleanName(body && body.name);
  if (!name) return errorJson(env, 'Give the mix a plain name, 3–80 characters, without links', 400, 'bad_name');
  const rows = Array.isArray(body && body.tracks) ? body.tracks : null;
  if (!rows || !rows.length) return errorJson(env, 'Missing tracks', 400);
  if (rows.length > MAX_TRACKS) return errorJson(env, `Too many tracks (max ${MAX_TRACKS})`, 400);
  if (rows.length < cfg.MIX_MIN_TRACKS) return errorJson(env, `A mix needs at least ${cfg.MIX_MIN_TRACKS} tracks`, 422, 'too_short');

  // the daily allowance, counted before any paid-for work happens
  const day = nowIso().slice(0, 10);
  const who = await whoToday(request, day);
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
  if (ids.length < cfg.MIX_MIN_TRACKS) {
    return errorJson(env, `Only ${ids.length} of those tracks are real YouTube videos — a mix needs ${cfg.MIX_MIN_TRACKS}`, 422, 'too_short');
  }

  // the same tracks in the same order are the same mix, whatever it is called
  const fingerprint = (await sha256hex(ids.join(','))).slice(0, 32);
  const existing = await env.DB.prepare(`SELECT id, name FROM mixes WHERE fingerprint = ?1`).bind(fingerprint).first();
  if (existing) return json(env, { id: existing.id, name: existing.name, tracks: ids.length, existing: true });

  const genre = normalizeGenre(body.genre || '').genre;
  const res = await env.DB.prepare(
    `INSERT INTO mixes (kind, name, blurb, genre, fingerprint, created_at)
     VALUES ('community', ?1, ?2, ?3, ?4, ?5)`
  ).bind(name, cleanBlurb(body.blurb), genre, fingerprint, nowIso()).run();
  const mixId = res.meta.last_row_id;
  const stmt = env.DB.prepare(`INSERT INTO mix_tracks (mix_id, track_id, position) VALUES (?1, ?2, ?3)`);
  await env.DB.batch(ids.map((tid, i) => stmt.bind(mixId, tid, i)));

  return json(env, { id: mixId, name, tracks: ids.length, ...(dropped.length ? { dropped } : {}) }, 201);
}

// ── POST /api/mixes/:id/play ──────────────────────────────────────────
export async function handleMixPlay(request, env, url) {
  const id = parseInt(url.pathname.split('/')[3], 10);
  if (!id) return errorJson(env, 'No such mix', 404);
  await env.DB.prepare(`UPDATE mixes SET plays = plays + 1 WHERE id = ?1 AND hidden = 0`).bind(id).run();
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
  // only a community mix hides itself; a premade one is yours to judge
  let hidden = false;
  if (m.kind === 'community' && n >= cfg.MIX_REPORTS_TO_HIDE) {
    await env.DB.prepare(`UPDATE mixes SET hidden = 1 WHERE id = ?1`).bind(id).run();
    hidden = true;
  }
  return json(env, { ok: true, hidden });
}
