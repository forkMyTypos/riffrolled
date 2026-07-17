-- ── riffrolled D1 schema (minimal) ───────────────────────────────────
-- Matches the table you created. Idempotent — running it against your
-- existing database changes nothing.
CREATE TABLE IF NOT EXISTS tracks (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL DEFAULT '',
  artist TEXT NOT NULL DEFAULT '',
  genre  TEXT NOT NULL DEFAULT '',
  url    TEXT NOT NULL DEFAULT ''
);

-- Optional but recommended: makes url lookups fast and blocks duplicates
-- at the database level. (Only fails if the table already holds dupes.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_url ON tracks(url);
