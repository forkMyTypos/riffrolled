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
        WHERE name   LIKE ?1 ESCAPE '\\' COLLATE NOCASE
           OR artist LIKE ?1 ESCAPE '\\' COLLATE NOCASE
           OR genre  LIKE ?1 ESCAPE '\\' COLLATE NOCASE
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
          WHERE genre LIKE ?1 ESCAPE '\\' COLLATE NOCASE
          ORDER BY id DESC LIMIT ?2`
      ).bind(likeParam(genre), limit)
    : db.prepare(
        `SELECT id, name, artist, genre, url FROM tracks ORDER BY id DESC LIMIT ?1`
      ).bind(limit);
  const { results } = await stmt.all();
  return results || [];
}

/**
 * Insert tracks, skipping any url we already have (dedupe by url).
 * Works whether or not the unique index exists.
 */
export async function insertTracks(db, tracks) {
  // sanitise at the single choke point: canonical YouTube urls only, clamped text
  const clean = tracks
    .map((t) => ({ ...clampTrack(t), url: canonicalYouTubeUrl(t.url) }))
    .filter((t) => t.url);
  if (!clean.length) return 0;
  const stmt = db.prepare(
    `INSERT INTO tracks (name, artist, genre, url)
     SELECT ?1, ?2, ?3, ?4
      WHERE NOT EXISTS (SELECT 1 FROM tracks WHERE url = ?4)`
  );
  await db.batch(clean.map((t) => stmt.bind(t.name, t.artist, t.genre, t.url)));
  return clean.length;
}

export async function getTrackByUrl(db, url) {
  return db
    .prepare(`SELECT id, name, artist, genre, url FROM tracks WHERE url = ?1`)
    .bind(url)
    .first();
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

export async function addPromotion(db, walletId, url, name, now, expires) {
  await db.prepare(
    `INSERT INTO promotions (wallet_id, url, name, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)`
  ).bind(walletId, url, String(name || '').slice(0, 300), now, expires).run();
}

export async function activePromotions(db, now, limit = 20) {
  const { results } = await db.prepare(
    `SELECT url, name, expires_at FROM promotions
      WHERE expires_at > ?1 ORDER BY created_at DESC LIMIT ?2`
  ).bind(now, limit).all();
  return results || [];
}
