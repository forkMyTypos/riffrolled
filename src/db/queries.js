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
