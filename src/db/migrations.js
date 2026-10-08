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
  // AI DJ resolution falls back to YouTube search (100 quota units a call),
  // so the site keeps a daily counter and stops when it's spent. One row
  // per UTC day, and nothing about who asked.
  { id: 9, name: 'ai lookup budget', sql: [
    `CREATE TABLE IF NOT EXISTS ai_lookups (
       day TEXT PRIMARY KEY, searches INTEGER NOT NULL DEFAULT 0,
       updated_at TEXT NOT NULL DEFAULT '')`,
  ]},
  // riffrolled's own copy of a DJ set: the name, and which tracks were in
  // it, in order. No wallet, no device id — a set, not a listener.
  { id: 10, name: 'playlists', sql: [
    `CREATE TABLE IF NOT EXISTS playlists (
       id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '',
       source TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS playlist_tracks (
       id INTEGER PRIMARY KEY AUTOINCREMENT, playlist_id INTEGER NOT NULL,
       track_id INTEGER NOT NULL, position INTEGER NOT NULL DEFAULT 0)`,
    `CREATE INDEX IF NOT EXISTS idx_pl_tracks ON playlist_tracks(playlist_id, position)`,
    `CREATE INDEX IF NOT EXISTS idx_pl_track_id ON playlist_tracks(track_id)`,
  ]},
  { id: 11, name: 'verified tracks', sql: [
    // 0 = nobody has confirmed this video exists. Everything already in the
    // catalogue arrived either from the YouTube Data API (search, channel and
    // playlist imports, where the id came from YouTube itself) or from a
    // browser that had already oEmbed-checked it, so existing rows are
    // grandfathered to 1 rather than hidden overnight.
    `ALTER TABLE tracks ADD COLUMN verified INTEGER NOT NULL DEFAULT 0`,
    `UPDATE tracks SET verified = 1`,
    `CREATE INDEX IF NOT EXISTS idx_tracks_verified ON tracks(verified)`,
  ]},
  { id: 12, name: 'config', sql: [
    // Every number that steers the economy, in a row rather than in code.
    // See src/config.js — the database is the first of three layers, with
    // wrangler.toml vars and shipped defaults behind it, so an empty table
    // (or no table at all) behaves exactly as the site did before.
    `CREATE TABLE IF NOT EXISTS config (
       key TEXT PRIMARY KEY, value TEXT NOT NULL,
       note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)`,
    // Who changed what, from what, to what. An economy you can retune is an
    // economy somebody can mis-tune; without this there is no way to find
    // out when a number started being wrong.
    `CREATE TABLE IF NOT EXISTS config_audit (
       id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL,
       old_value TEXT NOT NULL DEFAULT '', new_value TEXT NOT NULL DEFAULT '',
       at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_config_audit ON config_audit(at)`,
    // Deliberately NOT seeded with values. An empty table means every key
    // resolves to its wrangler.toml var or its shipped default, so this
    // migration changes no behaviour at all — which is the point of doing
    // it on its own.
  ]},
  { id: 13, name: 'aggregate counters', sql: [
    // What the catalogue knows about how a track is received. Counters, not
    // a log: one row per track however many times it is played, so storage
    // stays flat forever and no query gets slower with age. A log of every
    // play would be gigabytes a year at a few hundred listeners.
    `ALTER TABLE tracks ADD COLUMN plays INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE tracks ADD COLUMN likes INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE tracks ADD COLUMN dislikes INTEGER NOT NULL DEFAULT 0`,
    `CREATE INDEX IF NOT EXISTS idx_tracks_plays ON tracks(plays)`,

    // The links graph, shared. It has lived in Dexie since v11 and never
    // left the browser, which is why the server has had no idea whether a
    // link anyone made turned out to be useful.
    //
    // `created_by` is the ONLY place a wallet appears in this whole step,
    // and it is on the CONTRIBUTION, never on the consumption: we record
    // who made a link, never who followed one. That keeps the promise in
    // info.js intact while still making it possible to pay the person whose
    // link other people actually use.
    `CREATE TABLE IF NOT EXISTS links (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       key TEXT NOT NULL, type TEXT NOT NULL,
       a TEXT NOT NULL, b TEXT NOT NULL,
       origin TEXT NOT NULL DEFAULT 'manual',
       created_by TEXT NOT NULL DEFAULT '',
       follows INTEGER NOT NULL DEFAULT 0,
       first_ts TEXT NOT NULL, last_ts TEXT NOT NULL)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_links_key ON links(key)`,
    `CREATE INDEX IF NOT EXISTS idx_links_by ON links(created_by)`,
    `CREATE INDEX IF NOT EXISTS idx_links_follows ON links(follows)`,
  ]},
  { id: 14, name: 'campaigns', sql: [
    // A promotion row becomes a campaign. No new table: it already had an
    // owner, a track, a spend, an expiry, a pause flag and three counters,
    // so five columns finish the job and every existing query keeps working.
    `ALTER TABLE promotions ADD COLUMN label TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE promotions ADD COLUMN modes TEXT NOT NULL DEFAULT 'popup'`,
    `ALTER TABLE promotions ADD COLUMN dislikes INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE promotions ADD COLUMN replays INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE promotions ADD COLUMN ended_at TEXT NOT NULL DEFAULT ''`,

    // The switch from selling time to selling attention. credits_remaining
    // is what actually ends a campaign now; expires_at stays as an optional
    // ceiling so a half-spent campaign can't sit in the pool forever.
    //
    // Existing rows are seeded from `tokens`, which is what their owner
    // paid — so a campaign bought under the old time-based rules converts
    // to the same number of impressions rather than being wiped.
    `ALTER TABLE promotions ADD COLUMN credits_remaining INTEGER NOT NULL DEFAULT 0`,
    `UPDATE promotions SET credits_remaining = tokens WHERE credits_remaining = 0`,
    `UPDATE promotions SET label = name WHERE label = ''`,

    `CREATE INDEX IF NOT EXISTS idx_promo_live ON promotions(credits_remaining, paused)`,

    // Which brief offered which campaign, so copying the same brief twice
    // cannot charge twice. Rows are tiny and swept with the campaign.
    `CREATE TABLE IF NOT EXISTS brief_offers (
       brief_id TEXT NOT NULL, promotion_id INTEGER NOT NULL,
       charged INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL,
       PRIMARY KEY (brief_id, promotion_id))`,
  ]},

  { id: 15, name: 'mining: site-wide retarget and early tiers', sql: [
    /* Three things, all in service of one change: the per-wallet daily cap
       goes away and difficulty becomes the only brake.

       The cap never worked. Proof of work is Sybil-resistant because the
       cost is CPU, which you cannot fake; a per-identity cap is only
       Sybil-resistant if identities are expensive, and here a wallet is
       64 random hex characters. Anyone willing to hold fifty wallets had
       fifty times the cap, so the cap constrained precisely the honest
       user with one. Difficulty constrains everybody equally. */

    // How many credits the whole site minted, by UTC hour. One row per
    // hour, one UPDATE per mint, pruned after a week: bounded forever,
    // and enough history to measure a rate without storing who mined.
    `CREATE TABLE IF NOT EXISTS mint_rate (
       hour TEXT PRIMARY KEY, mints INTEGER NOT NULL DEFAULT 0)`,

    /* The controller's one piece of state. `adjustment` is extra bits
       added on top of the operator's base difficulty and is never
       negative: retargeting defends against inflation, it does not hand
       out discounts. That asymmetry matters — if a quiet site made
       mining cheap, the way to mine cheaply would be to wait for a quiet
       hour, and the operator's base would stop meaning anything. */
    `CREATE TABLE IF NOT EXISTS mine_state (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       adjustment INTEGER NOT NULL DEFAULT 0,
       rate REAL NOT NULL DEFAULT 0,
       changed_at TEXT NOT NULL DEFAULT '')`,
    `INSERT OR IGNORE INTO mine_state (id) VALUES (1)`,

    /* Joining order, so being early can be rewarded. A plain counter, not
       a timestamp comparison, because the tier boundaries are "the first
       thousand wallets" and that is a question about rank.

       A discount per wallet is safe against the trick that killed the
       cap: your CPU is the constraint, and every wallet you hold gets the
       same discount, so a thousand early wallets mine no faster than one.
       The reward is for being early, which is what it is meant to be. */
    `ALTER TABLE wallets ADD COLUMN seq INTEGER`,
    `UPDATE wallets SET seq = (
        SELECT rn FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn FROM wallets
        ) r WHERE r.id = wallets.id
      ) WHERE seq IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_wallets_seq ON wallets(seq)`,
  ]},

  { id: 16, name: 'campaign tags for AI brief matching', sql: [
    /* Which moods a promoted track suits, from the closed vocabulary in
       src/tags.js — the same words the DJ's own options are tagged with,
       so a promoter and a brief describe music in one language.

       Stored as a comma string rather than a join table. A campaign has
       at most eight tags and matching reads every live AI campaign at
       once anyway, so a table would add a join to buy nothing. */
    `ALTER TABLE promotions ADD COLUMN tags TEXT NOT NULL DEFAULT ''`,

    /* Offers are recorded when a brief is built and charged when it is
       copied, so brief_offers needs an index on the brief rather than
       only the primary key. Claiming reads every offer for one brief. */
    `CREATE INDEX IF NOT EXISTS idx_brief_offers_brief ON brief_offers(brief_id, charged)`,
    `CREATE INDEX IF NOT EXISTS idx_brief_offers_at ON brief_offers(at)`,
  ]},

  { id: 17, name: 'contribution rewards', sql: [
    /* Points earned per wallet per epoch, and nothing else. No record of
       WHICH track somebody added — the point total is all the payout
       needs, and a per-contribution log would be an unbounded table that
       also happens to be a list of everything each wallet ever added.
       See src/contrib.js for why the payout is a shared pool. */
    `CREATE TABLE IF NOT EXISTS contrib (
       wallet_id TEXT NOT NULL,
       epoch TEXT NOT NULL,
       points INTEGER NOT NULL DEFAULT 0,
       updated_at TEXT NOT NULL DEFAULT '',
       PRIMARY KEY (wallet_id, epoch))`,
    `CREATE INDEX IF NOT EXISTS idx_contrib_epoch ON contrib(epoch)`,

    /* One row per epoch that has been paid. This is the only thing
       standing between a retried sweep and paying everybody twice, so it
       is a table rather than a flag on something else. */
    `CREATE TABLE IF NOT EXISTS contrib_paid (
       epoch TEXT PRIMARY KEY, paid_at TEXT NOT NULL)`,
  ]},
];

/* Exported for the upgrade test, which applies the early migrations,
   inserts the kind of rows a live database actually holds, and then runs
   the rest — because every other test starts from an empty database, and
   "the migrations work" and "the migrations work on your data" are
   different claims. Nothing in the Worker reads this. */
export const _MIGRATIONS_FOR_TESTS = MIGRATIONS;

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
