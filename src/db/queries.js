// ── D1 query layer ────────────────────────────────────────────────────
// All SQL lives here as prepared statements with bound parameters.
// Table: tracks { id (auto), name, artist, genre, url }

/** Canonicalise any YouTube link/id form to https://www.youtube.com/watch?v=ID,
 *  or null if it isn't a valid YouTube video reference. Everything written to
 *  the tracks.url column goes through this — no arbitrary URLs in the DB. */
export function canonicalYouTubeUrl(input) {
  const s = String(input || '').trim();
  const m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(s)
    || /youtu\.be\/([A-Za-z0-9_-]{11})/.exec(s)
    || /\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})/.exec(s)
    || /^([A-Za-z0-9_-]{11})$/.exec(s);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : null;
}

/** Clamp text fields so no caller can bloat rows. */
function clampTrack(t) {
  return {
    name:   String(t.name   || '').slice(0, 300),
    artist: String(t.artist || '').slice(0, 200),
    genre:  String(t.genre  || '').slice(0, 100),
    url:    t.url,
  };
}

/** Escape LIKE wildcards in user input; we add our own around it. */
function likeParam(q) {
  return `%${q.replace(/([%_\\])/g, '\\$1')}%`;
}

/** Case-insensitive substring search across name/artist/genre. */
export async function searchTracks(db, q, limit) {
  const { results } = await db
    .prepare(
      `SELECT id, name, artist, genre, url
         FROM tracks
        WHERE verified = 1
          AND (name   LIKE ?1 ESCAPE '\\' COLLATE NOCASE
            OR artist LIKE ?1 ESCAPE '\\' COLLATE NOCASE
            OR genre  LIKE ?1 ESCAPE '\\' COLLATE NOCASE)
        ORDER BY id DESC
        LIMIT ?2`
    )
    .bind(likeParam(q), limit)
    .all();
  return results || [];
}

/** List tracks, optionally filtered by genre. */
export async function listTracks(db, genre, limit) {
  const stmt = genre
    ? db.prepare(
        `SELECT id, name, artist, genre, url FROM tracks
          WHERE verified = 1 AND genre LIKE ?1 ESCAPE '\\' COLLATE NOCASE
          ORDER BY id DESC LIMIT ?2`
      ).bind(likeParam(genre), limit)
    : db.prepare(
        `SELECT id, name, artist, genre, url FROM tracks
          WHERE verified = 1 ORDER BY id DESC LIMIT ?1`
      ).bind(limit);
  const { results } = await stmt.all();
  return results || [];
}

/**
 * Insert tracks, skipping any url we already have (dedupe by url).
 * Works whether or not the unique index exists.
 */
const SOURCES = new Set(['search', 'channel', 'playlist', 'paste', 'ai']);

/**
 * @param verified 1 when something has confirmed each video exists (the
 *   YouTube Data API returned it, or oEmbed answered 200), 0 when it is
 *   only a well-formed url somebody sent us. Unverified rows stay out of
 *   the public catalogue until something confirms them — see listTracks.
 *   The caller must pass this deliberately; defaulting it to 1 would make
 *   forgetting it the insecure option.
 */
export async function insertTracks(db, tracks, source = '', verified = 0) {
  // sanitise at the single choke point: canonical YouTube urls only, clamped text
  const clean = tracks
    .map((t) => ({ ...clampTrack(t), url: canonicalYouTubeUrl(t.url) }))
    .filter((t) => t.url);
  if (!clean.length) return 0;
  const src = SOURCES.has(source) ? source : '';
  const now = new Date().toISOString();
  const ok = verified ? 1 : 0;
  // NOT EXISTS keeps the first arrival's timestamp: re-adding never rewrites history
  const stmt = db.prepare(
    `INSERT INTO tracks (name, artist, genre, url, added_at, source, verified)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
      WHERE NOT EXISTS (SELECT 1 FROM tracks WHERE url = ?4)`
  );
  await db.batch(clean.map((t) => stmt.bind(t.name, t.artist, t.genre, t.url, now, src, ok)));
  return clean.length;
}

/** Promote rows to verified once something has confirmed them. Never demotes. */
export async function markVerified(db, urls) {
  const list = (urls || []).map(canonicalYouTubeUrl).filter(Boolean);
  if (!list.length) return 0;
  const stmt = db.prepare(`UPDATE tracks SET verified = 1 WHERE url = ?1 AND verified = 0`);
  const res = await db.batch(list.map((u) => stmt.bind(u)));
  return res.reduce((n, r) => n + ((r.meta && r.meta.changes) || 0), 0);
}

/** Which of these urls the catalogue already holds, and whether each is
 *  confirmed. Lets a route skip paying for a check it doesn't need — a D1
 *  read is not an external subrequest, an oEmbed call is. */
export async function knownUrls(db, urls) {
  const list = (urls || []).map(canonicalYouTubeUrl).filter(Boolean);
  if (!list.length) return new Map();
  const marks = list.map((_, i) => '?' + (i + 1)).join(', ');
  const { results } = await db
    .prepare(`SELECT url, verified FROM tracks WHERE url IN (${marks})`)
    .bind(...list).all();
  return new Map((results || []).map((r) => [r.url, !!r.verified]));
}

export async function getTrackByUrl(db, url) {
  return db
    .prepare(`SELECT id, name, artist, genre, url FROM tracks WHERE url = ?1`)
    .bind(url)
    .first();
}

/* ── playlists: riffrolled's own copy of a DJ AI set ──────────────────
   Name plus track ids in order, and nothing about who made it. Kept
   because a set is evidence of which tracks belong together — the raw
   material for the link layer later. */

export async function createPlaylist(db, name, source, now) {
  const res = await db.prepare(
    `INSERT INTO playlists (name, source, created_at) VALUES (?1, ?2, ?3)`
  ).bind(name, source || '', now).run();
  return res.meta.last_row_id;
}

export async function addPlaylistTracks(db, playlistId, trackIds) {
  if (!trackIds.length) return 0;
  const stmt = db.prepare(
    `INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)`
  );
  await db.batch(trackIds.map((id, i) => stmt.bind(playlistId, id, i)));
  return trackIds.length;
}

export async function listPlaylists(db, limit = 30) {
  const { results } = await db.prepare(
    `SELECT p.id, p.name, p.source, p.created_at, COUNT(pt.track_id) AS tracks
       FROM playlists p LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
      GROUP BY p.id ORDER BY p.id DESC LIMIT ?1`
  ).bind(limit).all();
  return results || [];
}

/* ── AI DJ lookup budget ──────────────────────────────────────────────
   Resolving an AI playlist can fall back to YouTube search.list at 100
   quota units a call, and the whole site shares 10,000 units a day. One
   counter per UTC day is all the bookkeeping that needs: the resolver
   checks it before spending and adds to it after. */

export async function countAiLookups(db, day) {
  const row = await db.prepare(`SELECT searches FROM ai_lookups WHERE day = ?1`).bind(day).first();
  return row?.searches ?? 0;
}

export async function addAiLookups(db, day, n, now) {
  await db.prepare(
    `INSERT INTO ai_lookups (day, searches, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(day) DO UPDATE SET searches = searches + ?2, updated_at = ?3`
  ).bind(day, n, now).run();
}

/** Total rows in tracks (used to report how many an import actually added). */
export async function countTracks(db) {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM tracks`).bind().first();
  return row?.n ?? 0;
}

// ── riff tokens: wallets, ledger, challenges, promotions ─────────────

export const WALLET_RE = /^[0-9a-f]{64}$/;

export async function ensureWallet(db, id, now) {
  await db.prepare(`INSERT INTO wallets (id, created_at) VALUES (?1, ?2)
                    ON CONFLICT(id) DO NOTHING`).bind(id, now).run();
}

/** Balance is always derived from the ledger — never stored separately. */
export async function walletBalance(db, id) {
  const row = await db.prepare(`SELECT COALESCE(SUM(delta),0) AS bal FROM ledger WHERE wallet_id = ?1`).bind(id).first();
  return row?.bal ?? 0;
}

export async function countMinedToday(db, id, dayPrefix) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM ledger
      WHERE wallet_id = ?1 AND reason = 'mine' AND created_at LIKE ?2`
  ).bind(id, dayPrefix + '%').first();
  return row?.n ?? 0;
}

export async function addLedger(db, walletId, delta, reason, ref, now) {
  await db.prepare(
    `INSERT INTO ledger (wallet_id, delta, reason, ref, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`
  ).bind(walletId, delta, reason, ref, now).run();
}

export async function createChallenge(db, id, walletId, difficulty, now, expires) {
  await db.prepare(
    `INSERT INTO mint_challenges (id, wallet_id, difficulty, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)`
  ).bind(id, walletId, difficulty, now, expires).run();
}

export async function getChallenge(db, id) {
  return db.prepare(`SELECT * FROM mint_challenges WHERE id = ?1`).bind(id).first();
}

/** Atomically consume a challenge; returns true only for the first caller. */
export async function useChallenge(db, id) {
  const res = await db.prepare(
    `UPDATE mint_challenges SET used = 1 WHERE id = ?1 AND used = 0`
  ).bind(id).run();
  return res.meta.changes > 0;
}

export async function addPromotion(db, walletId, url, name, now, expires, tokens = 0) {
  await db.prepare(
    `INSERT INTO promotions (wallet_id, url, name, created_at, expires_at, tokens)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  ).bind(walletId, url, String(name || '').slice(0, 300), now, expires, tokens).run();
}

export async function activePromotions(db, now, limit = 20) {
  const { results } = await db.prepare(
    `SELECT id, url, name, expires_at, views, plays, likes, tokens FROM promotions
      WHERE expires_at > ?1 AND paused = 0
      ORDER BY tokens DESC, created_at DESC LIMIT ?2`
  ).bind(now, limit).all();
  return results || [];
}

/**
 * Anonymous engagement counter for a promoted track. Increments every
 * currently-live promotion of that url — nothing about who did it is
 * stored, only that it happened. Returns rows touched (0 = not promoted).
 */
export async function bumpPromotion(db, url, kind, now) {
  const col = kind === 'like' ? 'likes' : kind === 'view' ? 'views' : 'plays';
  const res = await db.prepare(
    `UPDATE promotions SET ${col} = ${col} + 1
      WHERE url = ?1 AND expires_at > ?2 AND paused = 0`
  ).bind(url, now).run();
  return res.meta.changes;
}

/** One promotion, by id, scoped to its owner — every owner action goes through this. */
export async function getOwnedPromotion(db, id, walletId) {
  return db.prepare(`SELECT * FROM promotions WHERE id = ?1 AND wallet_id = ?2`)
    .bind(id, walletId).first();
}

/** Pause: bank the remaining time and drop out of the strip. */
export async function pausePromotion(db, id, remainingMs) {
  await db.prepare(
    `UPDATE promotions SET paused = 1, remaining_ms = ?2 WHERE id = ?1`
  ).bind(id, remainingMs).run();
}

/** Resume: spend the banked time forward from now. */
export async function resumePromotion(db, id, expiresAt) {
  await db.prepare(
    `UPDATE promotions SET paused = 0, remaining_ms = 0, expires_at = ?2 WHERE id = ?1`
  ).bind(id, expiresAt).run();
}

/** Top up: more tokens, more time, better slot. */
export async function extendPromotion(db, id, addTokens, expiresAt) {
  await db.prepare(
    `UPDATE promotions SET tokens = tokens + ?2, expires_at = ?3 WHERE id = ?1`
  ).bind(id, addTokens, expiresAt).run();
}

/** One wallet's own promotions, newest first, with live/expired state. */
export async function walletPromotions(db, walletId, now, limit = 25) {
  const { results } = await db.prepare(
    `SELECT id, url, name, created_at, expires_at, views, plays, likes, tokens, paused, remaining_ms,
            CASE WHEN expires_at > ?2 AND paused = 0 THEN 1 ELSE 0 END AS live
       FROM promotions WHERE wallet_id = ?1
      ORDER BY created_at DESC LIMIT ?3`
  ).bind(walletId, now, limit).all();
  return results || [];
}

/** Recent ledger entries for one wallet — what was mined, what was spent. */
export async function walletLedger(db, walletId, limit = 40) {
  const { results } = await db.prepare(
    `SELECT delta, reason, ref, created_at FROM ledger
      WHERE wallet_id = ?1 ORDER BY id DESC LIMIT ?2`
  ).bind(walletId, limit).all();
  return results || [];
}

/** Lifetime totals, so the Mine panel can show earned vs spent at a glance. */
export async function walletTotals(db, walletId) {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN delta > 0 THEN delta END), 0) AS earned,
            COALESCE(SUM(CASE WHEN delta < 0 THEN -delta END), 0) AS spent
       FROM ledger WHERE wallet_id = ?1`
  ).bind(walletId).first();
  return { earned: row?.earned ?? 0, spent: row?.spent ?? 0 };
}
