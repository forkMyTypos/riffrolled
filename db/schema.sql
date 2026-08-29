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

-- ── riff tokens: mined via hashcash PoW, tracked in a real ledger ────
-- Designed so a future tradeable phase inherits clean books: balances
-- are always SUM(ledger.delta); tokens are only ever minted by a
-- verified proof-of-work and only ever spent by recorded purchases.

CREATE TABLE IF NOT EXISTS wallets (
  id         TEXT PRIMARY KEY,          -- client-generated bearer key (64 hex)
  created_at TEXT NOT NULL
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
  plays      INTEGER NOT NULL DEFAULT 0,   -- anonymous counters: no wallet, no device id
  likes      INTEGER NOT NULL DEFAULT 0,
  tokens     INTEGER NOT NULL DEFAULT 0,   -- spend: longer run, higher in the strip
  paused     INTEGER NOT NULL DEFAULT 0,   -- owner-paused: hidden, remaining time preserved
  remaining_ms INTEGER NOT NULL DEFAULT 0  -- time banked while paused
);
CREATE INDEX IF NOT EXISTS idx_promo_active ON promotions(expires_at);
CREATE INDEX IF NOT EXISTS idx_promo_wallet ON promotions(wallet_id, created_at);
