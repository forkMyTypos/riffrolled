// ── whole channels ────────────────────────────────────────────────────
//
// The cheapest links YouTube has: a channel's uploads cost 1 quota unit per
// 50 videos to read (and 1 more per 50 to check). This file finds the
// channels worth reading and reads them, from the hourly Cron Trigger.
//
// FINDING THEM — discover()
//
//   · every channel behind a catalogue track becomes a candidate (the
//     channel id comes free with every YouTube answer; see tracks.channel_id)
//   · once a day, how its tracks do here is counted: tracks_here,
//     likes_here, plays_here
//   · YouTube's facts about it, 50 channels per unit: subscribers, video
//     count, uploads playlist, topic labels ("Electronic music") — and
//     refreshed every 25 days, like tracks (YouTube's 30-day rule)
//   · "Artist - Topic" channels (YouTube's automatic ones: nothing but
//     songs) are approved by themselves once CHANNEL_AUTO_LIKES of their
//     tracks have been liked here, if CHANNEL_AUTO_TOPIC is on; everything
//     else waits for you in the admin tool's Channels tab
//   · channels you add by hand (a link or @handle) are looked up (1 unit)
//
// READING THEM — harvest()
//
//   Approved channels, a few pages a run (CHANNEL_PAGES_PER_RUN), newest
//   first, up to CHANNEL_MAX_TRACKS each; after that, once a day, just the
//   newest page for new uploads. Only videos YouTube files under Music (any
//   video, for a Topic channel), embeddable, 1–GROW_MAX_MINUTES long, and
//   not covers / reactions / loops. At most CHANNEL_UNITS_DAILY units a day.

import { getConfig } from './config.js';
import { normalizeGenre } from './genres.js';
import { insertTracks, knownUrls, countAiLookups, addAiLookups, CHANNEL_RE } from './db/queries.js';
import { channelInfo, playlistPage, videoDetails, resolveChannel, YouTubeError, callBudget } from './services/youtube.js';
import { IMPOSTOR } from './routes/resolve.js';

const DAY = 86400000;
const idOf = (url) => (/[?&]v=([A-Za-z0-9_-]{11})/.exec(url || '') || [])[1] || '';

/** A channel's genre: YouTube's topic labels first, else what its tracks here mostly are. */
function genreFrom(topics, fallback) {
  for (const w of topics || []) {
    const g = normalizeGenre(w).genre;
    if (g) return g;
  }
  return fallback || '';
}

/** Find and describe channels. Never throws. */
export async function discover(env, now = new Date().toISOString()) {
  const out = { added: 0, described: 0, auto: 0, resolved: 0, units: 0, skipped: '' };
  const cfg = await getConfig(env);
  if (!cfg.CHANNEL_ON) { out.skipped = 'off'; return out; }
  const db = env.DB, day = now.slice(0, 10);

  // 1. once a day: new candidates from the catalogue, and how each does here
  if (!(await countAiLookups(db, 'chanscan:' + day))) {
    await addAiLookups(db, 'chanscan:' + day, 1, now);
    const r = await db.prepare(
      `INSERT INTO channels (id, title, created_at)
       SELECT channel_id, MAX(artist), ?1 FROM tracks WHERE channel_id != '' GROUP BY channel_id
       ON CONFLICT(id) DO NOTHING`
    ).bind(now).run();
    out.added = (r.meta && r.meta.changes) || 0;
    await db.prepare(
      `UPDATE channels SET
         tracks_here = (SELECT COUNT(*) FROM tracks t WHERE t.channel_id = channels.id AND t.verified = 1),
         likes_here  = (SELECT COALESCE(SUM(t.likes), 0) FROM tracks t WHERE t.channel_id = channels.id),
         plays_here  = (SELECT COALESCE(SUM(t.plays), 0) FROM tracks t WHERE t.channel_id = channels.id)`
    ).bind().run();
  }

  // 2. YouTube's facts: never fetched, or older than 25 days — the most promising first
  if (env.YT_API_KEY) {
    const stale = new Date(Date.parse(now) - 25 * DAY).toISOString();
    const { results } = await db.prepare(
      `SELECT id FROM channels WHERE status != 'rejected' AND info_at < ?1
        ORDER BY (status = 'approved') DESC, likes_here DESC, tracks_here DESC LIMIT 200`
    ).bind(stale).all();
    const ids = (results || []).map((r) => r.id).filter((id) => CHANNEL_RE.test(id));
    for (let i = 0; i < ids.length; i += 50) {
      let info;
      try { info = await channelInfo(env, ids.slice(i, i + 50)); out.units++; }
      catch (err) { out.skipped = err instanceof YouTubeError ? err.kind : 'error'; break; }
      const upd = db.prepare(
        `UPDATE channels SET title = ?2, handle = ?3, subs = ?4, videos = ?5, uploads = ?6, topics = ?7,
           is_topic = ?8, genre = ?9, info_at = ?10 WHERE id = ?1`
      );
      const gone = db.prepare(`UPDATE channels SET status = 'rejected', approved_by = 'gone', info_at = ?2 WHERE id = ?1`);
      const stmts = [];
      for (const id of ids.slice(i, i + 50)) {
        const c = info.get(id);
        if (!c) { stmts.push(gone.bind(id, now)); continue; }          // YouTube no longer has it
        const fallback = (await db.prepare(
          `SELECT genre FROM tracks WHERE channel_id = ?1 AND genre != '' GROUP BY genre ORDER BY COUNT(*) DESC LIMIT 1`
        ).bind(id).first())?.genre || '';
        stmts.push(upd.bind(id, c.title.slice(0, 200), c.handle.slice(0, 100), c.subs, c.videos, c.uploads,
          c.topics.join(', ').slice(0, 300), /\s-\sTopic$/i.test(c.title) ? 1 : 0, genreFrom(c.topics, fallback), now));
        out.described++;
      }
      if (stmts.length) await db.batch(stmts);
    }
  }

  // 3. "Artist - Topic" channels with liked tracks approve themselves (if you let them)
  if (cfg.CHANNEL_AUTO_TOPIC) {
    const r = await db.prepare(
      `UPDATE channels SET status = 'approved', approved_by = 'auto', approved_at = ?1
        WHERE status = 'candidate' AND is_topic = 1 AND likes_here >= ?2 AND uploads != ''`
    ).bind(now, cfg.CHANNEL_AUTO_LIKES).run();
    out.auto = (r.meta && r.meta.changes) || 0;
  }

  // 4. channels you added by hand
  if (env.YT_API_KEY) {
    const { results } = await db.prepare(`SELECT input FROM channel_adds ORDER BY added_at LIMIT 5`).bind().all();
    for (const a of results || []) {
      try {
        const c = await resolveChannel(env, a.input);
        out.units += /^@|\/@|UC[A-Za-z0-9_-]{20,}|user\//.test(a.input) ? 1 : 100;
        if (c && c.channelId) {
          await db.prepare(
            `INSERT INTO channels (id, title, uploads, status, approved_by, approved_at, created_at, is_topic)
             VALUES (?1, ?2, ?3, 'approved', 'admin', ?4, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET status = 'approved', approved_by = 'admin', approved_at = ?4,
               uploads = CASE WHEN ?3 != '' THEN ?3 ELSE uploads END`
          ).bind(c.channelId, c.title || '', c.uploadsPlaylistId || '', now, /\s-\sTopic$/i.test(c.title || '') ? 1 : 0).run();
          out.resolved++;
        }
      } catch (err) {
        if (err instanceof YouTubeError && (err.kind === 'quota' || err.kind === 'budget' || err.kind === 'rate_limit')) break;
        // not found or unreadable: dropped, the admin tool shows it never appeared
      }
      await db.prepare(`DELETE FROM channel_adds WHERE input = ?1`).bind(a.input).run();
    }
  }
  if (out.units) await addAiLookups(db, 'chan:' + day, out.units, now);
  return out;
}

/** Read approved channels. Never throws. */
export async function harvest(env, now = new Date().toISOString()) {
  const out = { channels: [], added: 0, units: 0, skipped: '' };
  const cfg = await getConfig(env);
  if (!cfg.CHANNEL_ON) { out.skipped = 'off'; return out; }
  if (!env.YT_API_KEY) { out.skipped = 'no key'; return out; }
  const db = env.DB, day = now.slice(0, 10), key = 'chan:' + day;
  let spent = await countAiLookups(db, key);
  if (spent + 2 > cfg.CHANNEL_UNITS_DAILY) { out.skipped = 'budget'; return out; }

  // not finished reading first (oldest approval first), then the daily look for new uploads
  const yesterday = new Date(Date.parse(now) - DAY).toISOString();
  const { results } = await db.prepare(
    `SELECT * FROM channels
      WHERE status = 'approved' AND uploads != '' AND (backfilled = 0 OR last_import_at < ?1)
      ORDER BY backfilled ASC, approved_at ASC, last_import_at ASC
      LIMIT ?2`
  ).bind(yesterday, cfg.CHANNELS_PER_RUN).all();
  const maxS = cfg.GROW_MAX_MINUTES * 60;

  for (const c of results || []) {
    let pages = 0, added = 0, units = 0, token = c.backfilled ? '' : c.backfill_token, done = !!c.backfilled, stop = '';
    const cap = c.backfilled ? 1 : cfg.CHANNEL_PAGES_PER_RUN;
    try {
      while (pages < cap && spent + units + 2 <= cfg.CHANNEL_UNITS_DAILY) {
        if (!c.backfilled && c.imported + added >= cfg.CHANNEL_MAX_TRACKS) { done = true; token = ''; break; }
        const page = await playlistPage(env, c.uploads, token);
        pages++; units++;
        let rows = page.items.filter((r) => !IMPOSTOR.test(r.name || ''));
        const known = await knownUrls(db, rows.map((r) => r.url));
        const fresh = rows.filter((r) => !known.has(r.url));
        if (fresh.length) {
          const info = await videoDetails(env, fresh.map((r) => idOf(r.url)));
          units += Math.ceil(fresh.length / 50);
          const good = fresh.filter((r) => {
            const v = info.get(idOf(r.url));
            return v && v.ok && v.secs >= 60 && v.secs <= maxS && (v.music || c.is_topic);
          }).map((r) => ({ name: r.name, artist: r.artist || c.title.replace(/\s-\sTopic$/i, ''), genre: c.genre, url: r.url, channelId: c.id }));
          if (good.length) { await insertTracks(db, good, 'channel', 1); added += good.length; }
        }
        token = page.next;
        // keeping up: once a page holds something we already had, the rest is old
        if (c.backfilled && known.size) break;
        if (!token) { done = true; break; }
      }
    } catch (err) {
      stop = err instanceof YouTubeError ? err.kind : 'error: ' + (err && err.message);
    }
    spent += units; out.units += units; out.added += added;
    out.channels.push((c.title || c.id) + ' +' + added + (stop ? ' (' + stop + ')' : ''));
    await db.prepare(
      `UPDATE channels SET imported = imported + ?2, backfill_token = ?3, backfilled = ?4, last_import_at = ?5 WHERE id = ?1`
    ).bind(c.id, added, done ? '' : (token || ''), done ? 1 : 0, now).run();
    if (stop) { out.skipped = stop; break; }
  }
  if (out.units) await addAiLookups(db, key, out.units, now);
  return out;
}
