// ── POST /api/resolve ─────────────────────────────────────────────────
// Turns an AI DJ playlist — lines of "artist + title" — into real tracks.
// The AI is never trusted: a video id it supplies is only ever a hint, and
// nothing enters the catalogue until it has been matched to something real.
//
// Three tiers, cheapest first. YouTube search.list costs 100 quota units a
// call (10,000 units a day in total), so it is the last resort, capped per
// request and budgeted per day:
//
//   1. link      the client validated the AI's link with YouTube's keyless
//                oEmbed endpoint and sends back the real title/channel —
//                zero quota
//   2. catalogue the track is already in our own tracks table — zero quota
//   3. youtube   search.list, scored against what the AI asked for — 100
//                units, only while the daily budget lasts
//
// Everything resolved this way is written to the catalogue with
// source='ai', so an AI DJ session makes the next one cheaper for everyone.

import { json, errorJson, readJson, nowIso } from '../utils/response.js';
import { getConfig } from '../config.js';
import {
  searchTracks, insertTracks, getTrackByUrl, canonicalYouTubeUrl,
  countAiLookups, addAiLookups,
} from '../db/queries.js';
import { searchYouTubeTrack, YouTubeError } from '../services/youtube.js';

const MAX_ITEMS = 30;        // one request can't ask for an unbounded playlist
const CANDIDATES = 6;        // rows considered per item before scoring

/** Tunables (override in wrangler.toml [vars]). */
export async function resolveConfig(env) {
  const c = await getConfig(env);
  return { dailyLookups: c.AI_YT_DAILY, perRequest: c.AI_YT_PER_REQUEST };
}

/* ── matching ───────────────────────────────────────────────────────────
   Music uploads carry noise — "(Official Video)", "[HD]", "Remastered
   2011", "feat." — and an AI's title rarely matches one character for
   character. Normalise both sides, then score on how much of the asked-for
   title and artist actually appears. */

const BRACKETS = /\([^)]*\)|\[[^\]]*\]/g;
const NOISE = /\b(official|officiel|video|audio|lyrics?|lyric|visuali[sz]er|hd|hq|4k|remaster(?:ed)?|full|album|version|mv|feat|ft)\b/g;

export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(BRACKETS, ' ')
    .replace(NOISE, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function words(s) {
  return norm(s).split(' ').filter((w) => w.length > 1);
}

/**
 * How well `row` ({ name, artist }) answers `want` ({ artist, title }).
 * 0 … 1. Title carries most of the weight: a right song on the wrong
 * channel is still the right song, a wrong song never is.
 */
export function matchScore(want, row) {
  const hay = norm(`${row.name || ''} ${row.artist || ''}`);
  const title = words(want.title);
  if (!title.length || !hay) return 0;
  const titleHit = title.filter((w) => hay.includes(w)).length / title.length;
  const artist = words(want.artist);
  // no artist given is neutral, not a penalty — plenty of requests are
  // "something chilled", and the AI may answer with a title only
  const artistHit = artist.length
    ? artist.filter((w) => hay.includes(w)).length / artist.length
    : 0.5;
  const score = titleHit * 0.72 + artistHit * 0.28 - impostorPenalty(want, row);
  return score > 0 ? score : 0;
}

/* Uploads that contain the right words but are not the track: reactions,
   covers, karaoke, sped-up edits, ten-hour loops. Restricting the search
   to YouTube's Music category keeps most of these out; this catches the
   rest. Penalised, not banned — if the request itself says "live" or
   "cover", that word is what was asked for. */
const IMPOSTOR = /\b(reaction|reacts?|review|cover|karaoke|instrumental|nightcore|slowed|sped\s*up|8d|tutorial|lesson|loop(ed)?|hours?|mix(tape)?|megamix|compilation|playlist|full\s*album)\b/i;

function impostorPenalty(want, row) {
  const name = String(row.name || '');
  if (!IMPOSTOR.test(name)) return 0;
  const asked = `${want.title || ''} ${want.artist || ''}`;
  const hit = IMPOSTOR.exec(name)[0];
  return new RegExp(`\\b${hit.replace(/\s+/g, '\\s*')}\\b`, 'i').test(asked) ? 0 : 0.45;
}

const ACCEPT = 0.6;          // below this we would rather find nothing

function pickBest(want, rows) {
  let best = null, bestScore = 0;
  for (const row of rows || []) {
    const s = matchScore(want, row);
    if (s > bestScore) { best = row; bestScore = s; }
  }
  return bestScore >= ACCEPT ? { row: best, score: bestScore } : null;
}

/** Clamp one incoming item to something safe to query and store. */
function cleanItem(raw) {
  const artist = String(raw?.artist || '').trim().slice(0, 200);
  const title = String(raw?.title || '').trim().slice(0, 300);
  const url = canonicalYouTubeUrl(raw?.videoId || raw?.url || '');
  const v = raw?.verified;
  const verified = v && typeof v === 'object'
    ? { name: String(v.name || '').trim().slice(0, 300), artist: String(v.artist || '').trim().slice(0, 200) }
    : null;
  return { artist, title, url, verified };
}

export async function handleResolve(request, env) {
  const body = await readJson(request);
  const raw = Array.isArray(body?.items) ? body.items : null;
  if (!raw || !raw.length) return errorJson(env, 'Missing items', 400);
  if (raw.length > MAX_ITEMS) return errorJson(env, `Too many items (max ${MAX_ITEMS})`, 400);

  const cfg = await resolveConfig(env);
  const now = nowIso();
  const day = now.slice(0, 10);
  const allowYouTube = body?.allowYouTube !== false;

  const items = raw.map(cleanItem);
  const results = items.map(() => null);
  const toInsert = [];

  // ── tier 1: a link the client already validated against oEmbed ──
  items.forEach((it, i) => {
    if (!it.url || !it.verified || !it.verified.name) return;
    // the client checked it exists; check it's the track that was asked for,
    // so a confidently wrong AI link doesn't become a catalogue row
    const score = matchScore(it, { name: it.verified.name, artist: it.verified.artist });
    if (score < ACCEPT && (it.title || it.artist)) return;   // fall through to search
    toInsert.push({ name: it.verified.name, artist: it.verified.artist, genre: '', url: it.url });
    results[i] = { i, ok: true, via: 'link', url: it.url, name: it.verified.name, artist: it.verified.artist };
  });

  // ── tier 2: our own catalogue (free) ──
  for (let i = 0; i < items.length; i++) {
    if (results[i]) continue;
    const it = items[i];
    if (!it.title && !it.artist) { results[i] = { i, ok: false, reason: 'empty' }; continue; }

    // an unverified hint id still earns a free lookup: if that exact video
    // is already in the catalogue, the AI was right and we know its real name
    if (it.url) {
      const row = await getTrackByUrl(env.DB, it.url);
      if (row) {
        results[i] = { i, ok: true, via: 'catalogue', url: row.url, name: row.name, artist: row.artist };
        continue;
      }
    }
    const rows = await searchTracks(env.DB, it.title || it.artist, CANDIDATES);
    const hit = pickBest(it, rows);
    if (hit) {
      results[i] = { i, ok: true, via: 'catalogue', url: hit.row.url, name: hit.row.name, artist: hit.row.artist };
    }
  }

  // ── tier 3: YouTube, capped and budgeted ──
  const pending = results.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
  let used = 0, left = 0, warning = '';

  if (pending.length) {
    const spentToday = await countAiLookups(env.DB, day);
    left = Math.max(cfg.dailyLookups - spentToday, 0);
    const budget = allowYouTube ? Math.min(pending.length, cfg.perRequest, left) : 0;

    for (const i of pending.slice(0, budget)) {
      const it = items[i];
      try {
        const found = await searchYouTubeTrack(env, `${it.artist} ${it.title}`.trim(), CANDIDATES);
        used++;
        const hit = pickBest(it, found);
        if (hit) {
          toInsert.push({ ...hit.row, genre: '' });
          results[i] = { i, ok: true, via: 'youtube', url: hit.row.url, name: hit.row.name, artist: hit.row.artist };
        } else {
          results[i] = { i, ok: false, reason: 'no_match' };
        }
      } catch (err) {
        if (err instanceof YouTubeError) {
          // quota gone or rate limited: stop spending, report honestly, and
          // leave the rest unresolved rather than failing the whole playlist
          warning = err.kind;
          break;
        }
        throw err;
      }
    }
    if (used) await addAiLookups(env.DB, day, used, now);
    left = Math.max(left - used, 0);

    for (const i of pending) {
      if (!results[i]) {
        results[i] = { i, ok: false, reason: warning || (allowYouTube ? 'budget' : 'not_searched') };
      }
    }
  } else {
    left = Math.max(cfg.dailyLookups - (await countAiLookups(env.DB, day)), 0);
  }

  // one write for everything new — deduped by url inside insertTracks
  if (toInsert.length) await insertTracks(env.DB, toInsert, 'ai', 1);      // resolved against YouTube before this point

  return json(env, {
    results,
    resolved: results.filter((r) => r && r.ok).length,
    lookups_used: used,
    lookups_left: left,
    lookups_limit: cfg.dailyLookups,
    ...(warning ? { warning } : {}),
  });
}
