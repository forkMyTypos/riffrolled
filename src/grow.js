// ── the catalogue grower ──────────────────────────────────────────────
//
// riffrolled can only mix what it has links for, and finding links one
// track at a time costs 100 YouTube quota units each. Playlists are the
// cheap way in: one search for playlists in a style (100 units) finds
// playlists holding hundreds of tracks, and reading them costs 1 unit per
// 50. So the grower, run by the hourly Cron Trigger:
//
//   1. knows what people want — every auto mix that came back short adds
//      its styles to grow_wants (routes/automix.js), and any broad genre
//      with fewer than GROW_MIN_GENRE tracks is added too
//   2. takes the most-wanted styles it hasn't grown in a week, a couple
//      per run (a free-plan Worker gets 50 outside requests per run)
//   3. for each: one playlist search, then reads the best one or two
//      playlists (up to GROW_TRACKS_PER_STYLE tracks)
//   4. checks every new video with videos.list (1 unit per 50): public,
//      embeddable, between 1 and GROW_MAX_MINUTES minutes — so hour-long
//      mixes, deleted videos and blocked embeds never join
//   5. drops covers / reactions / karaoke / loops, and adds the rest to
//      the catalogue, filed under that style's broad genre
//
// It spends at most GROW_UNITS_DAILY quota units a day (counted in
// ai_lookups under 'grow:<day>'), leaving the rest of the key's 10,000 for
// listener searches and AI lookups. GROW_ON = false stops it.

import { getConfig } from './config.js';
import { GENRES, normalizeGenre } from './genres.js';
import { insertTracks, knownUrls, countAiLookups, addAiLookups } from './db/queries.js';
import { searchYouTubePlaylists, fetchChannelUploads, videoDetails, YouTubeError } from './services/youtube.js';
import { IMPOSTOR } from './routes/resolve.js';

const COST_SEARCH = 100;
const WEEK = 7 * 86400000;
// playlists that are not songs
const NOT_MUSIC = /\b(podcast|interview|tutorial|lesson|reaction|karaoke|asmr|news|vlog|full\s*album\s*stream|10\s*hours?|1\s*hour)\b/i;

/** A style someone wanted more of. Called by the auto mix when it came back short. */
export async function wantMore(db, styles, now = new Date().toISOString()) {
  const s = db.prepare(
    `INSERT INTO grow_wants (style, genre, asked, last_at) VALUES (?1, ?2, 1, ?3)
       ON CONFLICT(style) DO UPDATE SET asked = asked + 1, last_at = ?3`
  );
  const rows = [...new Set((styles || []).map((x) => String(x || '').trim().toLowerCase()).filter((x) => x.length >= 3 && x.length <= 60))];
  if (rows.length) await db.batch(rows.map((st) => s.bind(st, normalizeGenre(st).genre, now)));
}

/** Broad genres the catalogue is thin on join the list (asked = 0, so real requests come first). */
async function wantThinGenres(db, min, now) {
  if (!(min > 0)) return;
  const { results } = await db.prepare(
    `SELECT genre, COUNT(*) AS n FROM tracks WHERE verified = 1 AND genre != '' GROUP BY genre`
  ).bind().all();
  const have = new Map((results || []).map((r) => [r.genre, r.n]));
  const s = db.prepare(
    `INSERT INTO grow_wants (style, genre, asked, last_at) VALUES (?1, ?2, 0, ?3)
       ON CONFLICT(style) DO NOTHING`
  );
  const thin = GENRES.filter((g) => (have.get(g) || 0) < min);
  if (thin.length) await db.batch(thin.map((g) => s.bind(g.toLowerCase(), g, now)));
  // a genre that has caught up leaves the list (one somebody asked for stays)
  const full = GENRES.filter((g) => (have.get(g) || 0) >= min).map((g) => g.toLowerCase());
  if (full.length) {
    const del = db.prepare(`DELETE FROM grow_wants WHERE style = ?1 AND asked = 0`);
    await db.batch(full.map((g) => del.bind(g)));
  }
}

/** Pick the playlists worth reading: on topic, not talk, not a 10-hour loop. */
export function choosePlaylists(style, lists, n = 2) {
  const words = String(style).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
  const scored = lists
    .filter((p) => !NOT_MUSIC.test(p.title))
    .map((p, i) => {
      const t = p.title.toLowerCase();
      const hits = words.filter((w) => t.includes(w)).length;
      return { p, hits, score: hits * 100 - i };   // most on-topic first, then YouTube's own order
    })
    .filter((x) => !words.length || x.hits > 0);   // at least one word of the style in its title
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map((x) => x.p);
}

/** Grow one style. Returns { units, added, lists }. */
export async function growStyle(env, want, cfg) {
  let units = 0;
  const lists = await searchYouTubePlaylists(env, want.style + ' music', 15);
  units += COST_SEARCH;
  const pick = choosePlaylists(want.style, lists, 2);
  const per = Math.max(20, Math.floor(cfg.GROW_TRACKS_PER_STYLE / Math.max(pick.length, 1)));
  let rows = [];
  for (const p of pick) {
    const got = await fetchChannelUploads(env, p.id, per);
    units += Math.max(1, Math.ceil(got.length / 50));
    rows = rows.concat(got);
  }
  // new ones only, and not covers / reactions / loops
  const seen = new Set();
  rows = rows.filter((r) => r.url && !seen.has(r.url) && seen.add(r.url) && !IMPOSTOR.test(r.name || ''));
  const known = await knownUrls(env.DB, rows.map((r) => r.url));
  rows = rows.filter((r) => !known.has(r.url));
  if (!rows.length) return { units, added: 0, lists: pick.length };

  // what YouTube says about each: public, embeddable, song-length
  const ids = rows.map((r) => /v=([A-Za-z0-9_-]{11})/.exec(r.url)[1]);
  const info = await videoDetails(env, ids);
  units += Math.ceil(ids.length / 50);
  const maxS = cfg.GROW_MAX_MINUTES * 60;
  const good = rows.filter((r, i) => {
    const v = info.get(ids[i]);
    return v && v.ok && v.secs >= 60 && v.secs <= maxS;
  }).map((r) => ({
    name: r.name, artist: r.artist,
    // filed under the style's broad genre (if it has one); the style itself
    // is kept as what it "came in as", so a search for it finds them
    genre: want.style,
    url: r.url,
  }));
  if (good.length) await insertTracks(env.DB, good, 'playlist', 1);
  return { units, added: good.length, lists: pick.length };
}

/** One hourly pass. Never throws: returns what it did, for the log. */
export async function grow(env, now = new Date().toISOString()) {
  const out = { styles: [], units: 0, added: 0, skipped: '' };
  const cfg = await getConfig(env);
  if (!cfg.GROW_ON) { out.skipped = 'off'; return out; }
  if (!env.YT_API_KEY) { out.skipped = 'no key'; return out; }
  const day = now.slice(0, 10), key = 'grow:' + day;
  let spent = await countAiLookups(env.DB, key);
  if (spent + COST_SEARCH + 20 > cfg.GROW_UNITS_DAILY) { out.skipped = 'budget'; return out; }

  await wantThinGenres(env.DB, cfg.GROW_MIN_GENRE, now);
  const since = new Date(Date.parse(now) - WEEK).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT style, genre FROM grow_wants
      WHERE done_at IS NULL OR done_at < ?1
      ORDER BY asked DESC, last_at DESC
      LIMIT ?2`
  ).bind(since, cfg.GROW_STYLES_PER_RUN).all();

  for (const want of results || []) {
    if (spent + COST_SEARCH + 20 > cfg.GROW_UNITS_DAILY) break;
    let r = { units: 0, added: 0, lists: 0 };
    try {
      r = await growStyle(env, want, cfg);
    } catch (err) {
      if (err instanceof YouTubeError) { out.skipped = err.kind; r.units = r.units || COST_SEARCH; }
      else { out.skipped = 'error: ' + (err && err.message); }
    }
    spent += r.units; out.units += r.units; out.added += r.added;
    out.styles.push(want.style + ' +' + r.added);
    await addAiLookups(env.DB, key, r.units, now);
    await env.DB.prepare(
      `UPDATE grow_wants SET done_at = ?2, added = added + ?3, runs = runs + 1 WHERE style = ?1`
    ).bind(want.style, now, r.added).run();
    if (out.skipped === 'quota' || out.skipped === 'rate_limit') break;   // YouTube said stop: stop
  }
  return out;
}
