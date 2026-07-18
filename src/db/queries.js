// ── D1 query layer ────────────────────────────────────────────────────
// All SQL lives here as prepared statements with bound parameters.
// Table: tracks { id (auto), name, artist, genre, url }

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
  if (!tracks.length) return 0;
  const stmt = db.prepare(
    `INSERT INTO tracks (name, artist, genre, url)
     SELECT ?1, ?2, ?3, ?4
      WHERE NOT EXISTS (SELECT 1 FROM tracks WHERE url = ?4)`
  );
  await db.batch(tracks.map((t) => stmt.bind(t.name, t.artist || '', t.genre || '', t.url)));
  return tracks.length;
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
