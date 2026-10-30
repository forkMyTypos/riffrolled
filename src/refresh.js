// ── the 30-day refresh ────────────────────────────────────────────────
//
// YouTube's developer policies allow an app to keep data it got from
// YouTube (a video's title, its channel) for 30 days; after that it must be
// refreshed or deleted. riffrolled's shared catalogue is exactly that kind
// of data, so every track is re-checked with YouTube at least every
// REFRESH_DAYS (25 by default — under 30, with room for missed runs).
//
// HOW, CHEAPLY
//
// videos.list answers for 50 videos in one call, for 1 quota unit and one
// outside request. The hourly Cron Trigger takes the tracks checked longest
// ago (never-checked first) — just enough per run that the whole catalogue
// comes round in REFRESH_DAYS, at most REFRESH_MAX_CALLS calls a run.
// 10,000 tracks is ~9 calls a day; 300,000 is ~250 units a day. If the
// YouTube quota is gone for the day, up to OEMBED_FALLBACK tracks are
// checked with oEmbed instead (free, no key, one request each).
//
// WHAT HAPPENS TO EACH TRACK
//
//   still there and embeddable  checked_at = now; the title and channel
//                               are refreshed from YouTube — but only for
//                               tracks whose names came FROM YouTube
//                               (search, channel and playlist imports).
//                               Names typed by a person or the AI DJ are
//                               not YouTube data and are left alone.
//   gone / private / can't be   first time: hidden at once (verified = 0,
//   embedded any more           gone_at = now), so it stops turning up in
//                               mixes and the catalogue. Next check, a day
//                               or more later, agrees: deleted, with its
//                               place in any shared mix. Two strikes,
//                               because one bad answer from YouTube must
//                               never delete good tracks.
//
// A SAFETY CATCH: if YouTube says more than half of a batch is gone, three
// of them are asked about again with oEmbed. Only if oEmbed agrees (a clear
// 404) does the run go on; otherwise nothing is struck and it tries again
// next hour.

import { getConfig } from './config.js';
import { videoDetails, YouTubeError } from './services/youtube.js';
import { verifyOne } from './services/oembed.js';

const PER_CALL = 50;
const OEMBED_FALLBACK = 20;
const DAY = 86400000;
// where the stored names came from YouTube itself, so refreshing them is right
const FROM_YOUTUBE = new Set(['search', 'channel', 'playlist']);

const idOf = (url) => (/[?&]v=([A-Za-z0-9_-]{11})/.exec(url || '') || [])[1] || '';

/** How many to check this run so everything comes round in `days`. */
export function batchSize(total, days, maxCalls) {
  const perRun = Math.ceil(total / Math.max(1, days * 24));
  return Math.min(maxCalls * PER_CALL, Math.max(PER_CALL, Math.ceil(perRun / PER_CALL) * PER_CALL));
}

/** The verdicts as database writes. Returns the counts. */
async function apply(db, rows, verdict, now) {
  const out = { fresh: 0, renamed: 0, struck: 0, deleted: 0 };
  const ok = db.prepare(`UPDATE tracks SET checked_at = ?2, gone_at = '' WHERE id = ?1`);
  const rename = db.prepare(`UPDATE tracks SET checked_at = ?2, gone_at = '', name = ?3, artist = ?4 WHERE id = ?1`);
  // struck: hidden now, and back at the front of the queue ('') so the next runs look again
  const strike = db.prepare(`UPDATE tracks SET checked_at = '', gone_at = ?2, verified = 0 WHERE id = ?1`);
  const wait = db.prepare(`UPDATE tracks SET checked_at = '' WHERE id = ?1`);
  const delMix = db.prepare(`DELETE FROM mix_tracks WHERE track_id = ?1`);
  const del = db.prepare(`DELETE FROM tracks WHERE id = ?1`);
  const stmts = [];
  for (const r of rows) {
    const v = verdict.get(r.id);
    if (v === undefined) continue;                 // not asked this time
    if (v && v.ok) {
      const fromYt = FROM_YOUTUBE.has(r.source);
      const name = (v.title || '').slice(0, 300), artist = (v.channel || '').slice(0, 200);
      if (fromYt && name && (name !== r.name || (artist && artist !== r.artist))) {
        stmts.push(rename.bind(r.id, now, name, artist || r.artist)); out.renamed++;
      } else stmts.push(ok.bind(r.id, now));
      out.fresh++;
    } else if (r.gone_at && Date.parse(now) - Date.parse(r.gone_at) >= DAY) {
      stmts.push(delMix.bind(r.id), del.bind(r.id)); out.deleted++;     // second strike
    } else if (!r.gone_at) {
      stmts.push(strike.bind(r.id, now)); out.struck++;                 // first strike: hidden
    } else {
      stmts.push(wait.bind(r.id));                                       // struck under a day ago: ask again later
    }
  }
  if (stmts.length) await db.batch(stmts);
  return out;
}

/** One hourly pass. Never throws: returns what it did, for the log. */
export async function refresh(env, now = new Date().toISOString()) {
  const out = { checked: 0, fresh: 0, renamed: 0, struck: 0, deleted: 0, units: 0, via: 'videos', skipped: '' };
  const cfg = await getConfig(env);
  if (!cfg.REFRESH_ON) { out.skipped = 'off'; return out; }

  const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM tracks`).bind().first())?.n || 0;
  if (!total) return out;
  const want = batchSize(total, cfg.REFRESH_DAYS, cfg.REFRESH_MAX_CALLS);
  /* The longest ago first; never checked ('') sorts before any date. A
     track isn't due until half of REFRESH_DAYS has passed, so a small
     catalogue isn't re-checked every few hours for nothing. */
  const due = new Date(Date.parse(now) - (cfg.REFRESH_DAYS / 2) * DAY).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT id, url, name, artist, source, gone_at FROM tracks
      WHERE checked_at < ?2
      ORDER BY checked_at ASC, id ASC LIMIT ?1`
  ).bind(want, due).all();
  const rows = (results || []).filter((r) => idOf(r.url));
  if (!rows.length) return out;

  let quotaGone = !env.YT_API_KEY;
  for (let i = 0; i < rows.length && !quotaGone; i += PER_CALL) {
    const batch = rows.slice(i, i + PER_CALL);
    let info;
    try {
      info = await videoDetails(env, batch.map((r) => idOf(r.url)));
      out.units++;
    } catch (err) {
      if (err instanceof YouTubeError && (err.kind === 'quota' || err.kind === 'rate_limit' || err.kind === 'config')) { quotaGone = true; break; }
      out.skipped = 'error: ' + (err && err.message);
      return out;
    }
    const missingRows = batch.filter((r) => { const v = info.get(idOf(r.url)); return !v || !v.ok; });
    if (batch.length >= 10 && missingRows.length > batch.length / 2) {
      // a second opinion before believing it: oEmbed on three of them
      const sample = missingRows.slice(0, 3);
      const second = await Promise.all(sample.map((r) => verifyOne(idOf(r.url), { cache: false })));
      if (!second.every((v) => v && v.ok === false && !v.unknown)) {
        out.skipped = 'safety: YouTube said ' + missingRows.length + ' of ' + batch.length + ' are gone and oEmbed did not agree; nothing struck';
        return out;
      }
    }
    const verdict = new Map(batch.map((r) => {
      const v = info.get(idOf(r.url));
      return [r.id, v && v.ok ? v : null];
    }));
    const r = await apply(env.DB, batch, verdict, now);
    out.checked += batch.length;
    for (const k of ['fresh', 'renamed', 'struck', 'deleted']) out[k] += r[k];
  }

  /* No quota (or no key): oEmbed, free, for a few. It knows "exists" and
     the title and channel; it can't tell "embeddable", and anything other
     than a clear 404/400 is "don't know", which changes nothing. */
  if (quotaGone) {
    out.via = 'oembed';
    const left = rows.slice(out.checked, out.checked + OEMBED_FALLBACK);
    const verdict = new Map();
    for (const r of left) {
      const v = await verifyOne(idOf(r.url), { cache: false });
      if (v.unknown) continue;
      verdict.set(r.id, v.ok ? { ok: true, title: v.name, channel: (v.artist || '').replace(/\s+-\s+Topic$/i, '') } : null);
    }
    const r = await apply(env.DB, left, verdict, now);
    out.checked += verdict.size;
    for (const k of ['fresh', 'renamed', 'struck', 'deleted']) out[k] += r[k];
  }
  return out;
}

/** For the admin tool: how fresh the catalogue is. */
export async function refreshStatus(db, now = new Date().toISOString()) {
  const cut = new Date(Date.parse(now) - 30 * DAY).toISOString();
  const r = await db.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN checked_at = '' THEN 1 ELSE 0 END), 0) AS never,
            COALESCE(SUM(CASE WHEN checked_at != '' AND checked_at < ?1 THEN 1 ELSE 0 END), 0) AS stale,
            COALESCE(SUM(CASE WHEN gone_at != '' THEN 1 ELSE 0 END), 0) AS gone
       FROM tracks`
  ).bind(cut).first();
  return r || { total: 0, never: 0, stale: 0, gone: 0 };
}
