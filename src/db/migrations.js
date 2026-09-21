// ── self-applying migrations ──────────────────────────────────────────
// The Worker brings its own database up to date. No more pasting SQL into
// the D1 console after a deploy: push the code, and the first API request
// applies whatever this list has that the database doesn't.
//
// Rules for adding one:
//   · append a new entry with the next id — never edit or reorder old ones
//   · each statement must be safe to meet a database that already has it
//     (CREATE … IF NOT EXISTS; ADD COLUMN is fine — "duplicate column" is
//     treated as already applied, which also covers columns added by hand)
//   · db/schema.sql is kept as readable documentation; this file is what runs

const MIGRATIONS = [
  { id: 1, name: 'base schema', sql: [
    `CREATE TABLE IF NOT EXISTS tracks (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL DEFAULT '', artist TEXT NOT NULL DEFAULT '',
       genre TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '')`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_url ON tracks(url)`,
  ]},
  { id: 2, name: 'riff tokens', sql: [
    `CREATE TABLE IF NOT EXISTS wallets (id TEXT PRIMARY KEY, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS mint_challenges (
       id TEXT PRIMARY KEY, wallet_id TEXT NOT NULL, difficulty INTEGER NOT NULL,
       created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0)`,
    `CREATE INDEX IF NOT EXISTS idx_chal_wallet ON mint_challenges(wallet_id, used)`,
    `CREATE TABLE IF NOT EXISTS ledger (
       id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_id TEXT NOT NULL, delta INTEGER NOT NULL,
       reason TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON ledger(wallet_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ledger_reason ON ledger(wallet_id, reason, created_at)`,
    `CREATE TABLE IF NOT EXISTS promotions (
       id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_id TEXT NOT NULL, url TEXT NOT NULL,
       name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_promo_active ON promotions(expires_at)`,
  ]},
  { id: 3, name: 'promotion stats', sql: [
    `ALTER TABLE promotions ADD COLUMN plays INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE promotions ADD COLUMN likes INTEGER NOT NULL DEFAULT 0`,
  ]},
  { id: 4, name: 'variable spend', sql: [
    `ALTER TABLE promotions ADD COLUMN tokens INTEGER NOT NULL DEFAULT 0`,
    `CREATE INDEX IF NOT EXISTS idx_promo_wallet ON promotions(wallet_id, created_at)`,
  ]},
  { id: 5, name: 'pause / resume', sql: [
    `ALTER TABLE promotions ADD COLUMN paused INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE promotions ADD COLUMN remaining_ms INTEGER NOT NULL DEFAULT 0`,
  ]},
  { id: 6, name: 'popup impressions', sql: [
    `ALTER TABLE promotions ADD COLUMN views INTEGER NOT NULL DEFAULT 0`,
  ]},
  // when and how each track entered the catalogue — deliberately not who
  { id: 7, name: 'catalogue activity', sql: [
    `ALTER TABLE tracks ADD COLUMN added_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE tracks ADD COLUMN source TEXT NOT NULL DEFAULT ''`,
    `CREATE INDEX IF NOT EXISTS idx_tracks_added ON tracks(added_at)`,
  ]},
  // every admin action leaves a line, so the admin page is accountable too
  { id: 8, name: 'admin audit log', sql: [
    `CREATE TABLE IF NOT EXISTS admin_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL,
       action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '')`,
  ]},
];

// "already there" is success: the work this statement would do is done
const ALREADY = /duplicate column|already exists/i;

let ready = false;      // per isolate: once current, never check again
let inflight = null;    // concurrent first requests share one run

export async function ensureSchema(db) {
  if (ready) return;
  if (!inflight) {
    inflight = (async () => {
      await db.prepare(
        `CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at TEXT NOT NULL)`
      ).bind().run();
      const { results } = await db.prepare(`SELECT id FROM _migrations`).bind().all();
      const done = new Set((results || []).map((r) => r.id));

      for (const m of MIGRATIONS) {
        if (done.has(m.id)) continue;
        for (const stmt of m.sql) {
          try {
            await db.prepare(stmt).bind().run();
          } catch (err) {
            if (!ALREADY.test(String(err && err.message))) {
              throw new Error(`migration ${m.id} (${m.name}) failed: ${err.message}`);
            }
          }
        }
        // INSERT OR IGNORE: another isolate may have finished the same one
        await db.prepare(
          `INSERT OR IGNORE INTO _migrations (id, name, applied_at) VALUES (?1, ?2, ?3)`
        ).bind(m.id, m.name, new Date().toISOString()).run();
      }
      ready = true;
    })();
  }
  try {
    await inflight;
  } finally {
    inflight = null;    // on failure, the next request tries again
  }
}

/** For tests: forget that this isolate is up to date. */
export function _resetForTests() { ready = false; inflight = null; }

export const LATEST_MIGRATION = MIGRATIONS[MIGRATIONS.length - 1].id;
