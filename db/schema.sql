-- ── riffrolled D1 schema ───────────────────────────────────────────────
-- DOCUMENTATION ONLY. The Worker now migrates its own database on the first
-- API request after each deploy (src/db/migrations.js is what actually runs).
-- You never need to paste this into the D1 console again. To change the
-- schema, append a migration there; keep this file in step so it stays a
-- readable picture of the tables.
--
-- ── riffrolled D1 schema (minimal) ───────────────────────────────────
-- Matches the table you created. Idempotent — running it against your
-- existing database changes nothing.
CREATE TABLE IF NOT EXISTS tracks (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL DEFAULT '',
  artist TEXT NOT NULL DEFAULT '',
  genre  TEXT NOT NULL DEFAULT '',
  genre_raw TEXT NOT NULL DEFAULT '',   -- what the AI actually said; genre is the closed list (src/genres.js)
  url    TEXT NOT NULL DEFAULT ''
);

-- Optional but recommended: makes url lookups fast and blocks duplicates
-- at the database level. (Only fails if the table already holds dupes.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_url ON tracks(url);

-- ── riff tokens: mined via hashcash PoW, tracked in a real ledger ────
-- Designed so a future tradeable phase inherits clean books: balances
-- are always SUM(ledger.delta); tokens are only ever minted by a
-- verified proof-of-work and only ever spent by recorded purchases.

CREATE TABLE IF NOT EXISTS wallets (
  id         TEXT PRIMARY KEY,          -- client-generated bearer key (64 hex)
  created_at TEXT NOT NULL,
  pub INTEGER NOT NULL DEFAULT 0   -- 1 = filed under its public key (migration 21)
);

CREATE TABLE IF NOT EXISTS mint_challenges (
  id         TEXT PRIMARY KEY,          -- random challenge string
  wallet_id  TEXT NOT NULL,
  difficulty INTEGER NOT NULL,          -- required leading zero bits
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chal_wallet ON mint_challenges(wallet_id, used);

CREATE TABLE IF NOT EXISTS ledger (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id  TEXT NOT NULL,
  delta      INTEGER NOT NULL,          -- +mint / -spend
  reason     TEXT NOT NULL,             -- 'mine' | 'promote' | …
  ref        TEXT NOT NULL DEFAULT '',  -- e.g. challenge id or promoted url
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON ledger(wallet_id);
CREATE INDEX IF NOT EXISTS idx_ledger_reason ON ledger(wallet_id, reason, created_at);

CREATE TABLE IF NOT EXISTS promotions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id  TEXT NOT NULL,
  url        TEXT NOT NULL,             -- canonical YouTube url from tracks
  name       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  views      INTEGER NOT NULL DEFAULT 0,   -- popup impressions (anonymous)
  plays      INTEGER NOT NULL DEFAULT 0,   -- anonymous counters: no wallet, no device id
  likes      INTEGER NOT NULL DEFAULT 0,
  tokens     INTEGER NOT NULL DEFAULT 0,   -- spend: longer run, higher in the strip
  paused     INTEGER NOT NULL DEFAULT 0,   -- owner-paused: hidden, remaining time preserved
  remaining_ms INTEGER NOT NULL DEFAULT 0  -- time banked while paused
);
CREATE INDEX IF NOT EXISTS idx_promo_active ON promotions(expires_at);
CREATE INDEX IF NOT EXISTS idx_promo_wallet ON promotions(wallet_id, created_at);

-- ── AI DJ lookup budget ──────────────────────────────────────────────
-- Resolving an AI-generated playlist prefers free paths (a link the
-- browser validated via YouTube's keyless oEmbed endpoint, then our own
-- catalogue) and only falls back to YouTube search.list, which costs 100
-- quota units a call out of 10,000 a day for the whole site. One counter
-- per UTC day; nothing about who asked is recorded.

-- ── playlists: riffrolled's own copy of a DJ AI set ──────────────────
-- Just the name and which tracks were in it, in order. No wallet, no
-- device id, nothing about who built it — a set, not a listener. Kept
-- because "these tracks belonged together" is the useful part.

CREATE TABLE IF NOT EXISTS playlists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT '',     -- 'ai' today
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL,
  track_id    INTEGER NOT NULL,            -- tracks.id
  position    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pl_tracks ON playlist_tracks(playlist_id, position);
CREATE INDEX IF NOT EXISTS idx_pl_track_id ON playlist_tracks(track_id);

CREATE TABLE IF NOT EXISTS ai_lookups (
  day        TEXT PRIMARY KEY,              -- YYYY-MM-DD (UTC)
  searches   INTEGER NOT NULL DEFAULT 0,    -- search.list calls spent that day
  updated_at TEXT NOT NULL DEFAULT ''
);

-- ── mixes: sets meant to be shown to other people ────────────────────
-- 'premade' are added by the owner in the local admin tool; 'community'
-- are shared by listeners with the Share button. creator is the sharer's
-- wallet public key, seen only by the owner; a key's shares wait (pending)
-- until the owner approves it once (see sharers). fingerprint (a hash of the ordered track
-- ids) stops the same set being listed twice. mix_shares and mix_reports
-- hold a per-day hash used only to rate-limit; mix_shares is pruned.

CREATE TABLE IF NOT EXISTS mixes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'community',
  name TEXT NOT NULL DEFAULT '',
  blurb TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  fingerprint TEXT NOT NULL DEFAULT '',
  hidden INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  plays INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  brief TEXT NOT NULL DEFAULT '',         -- the DJ AI choices, as JSON (migration 20)
  creator TEXT NOT NULL DEFAULT '',       -- sharer's wallet public key, admin-only (migration 22)
  pending INTEGER NOT NULL DEFAULT 0,     -- 1 = waiting for the owner's OK, listed nowhere (migration 23)
  slug TEXT NOT NULL DEFAULT ''           -- 8-character share code: riffrolled.com/?m=<slug> (migration 24)
);
CREATE INDEX IF NOT EXISTS idx_mixes_list ON mixes(kind, hidden, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mixes_fp ON mixes(fingerprint) WHERE fingerprint != '';
CREATE TABLE IF NOT EXISTS mix_tracks (
  mix_id INTEGER NOT NULL, track_id INTEGER NOT NULL, position INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT ''           -- the DJ's one-line reason (migration 20)
);
CREATE INDEX IF NOT EXISTS idx_mix_tracks ON mix_tracks(mix_id, position);
CREATE TABLE IF NOT EXISTS mix_reports (
  mix_id INTEGER NOT NULL, who TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (mix_id, who)
);
-- sharers: one row per wallet public key that has tried to share a mix.
-- sharing: 0 = not yet (its shares wait in the admin tool), 1 = approved
-- (shares go straight up), -1 = blocked. Default is 0 (migration 23).
CREATE TABLE IF NOT EXISTS sharers (
  pub TEXT PRIMARY KEY, sharing INTEGER NOT NULL DEFAULT 0,
  first_at TEXT NOT NULL DEFAULT '', decided_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_mixes_pending ON mixes(pending, creator);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mixes_slug ON mixes(slug) WHERE slug != '';
CREATE TABLE IF NOT EXISTS mix_shares (
  day TEXT NOT NULL, who TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, who)
);
