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

import { normalizeGenre } from '../genres.js';
import { newMixSlug } from '../slug.js';

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
  { id: 18, name: 'closed genre list', sql: [
    /* tracks.genre becomes a closed list (src/genres.js). What the AI
       actually said moves to genre_raw FIRST, so tidying the list can
       never lose a word: a genre that matches nothing is blanked in
       genre, and still searchable and recoverable here. */
    `ALTER TABLE tracks ADD COLUMN genre_raw TEXT NOT NULL DEFAULT ''`,
    `UPDATE tracks SET genre_raw = genre WHERE genre_raw = '' AND genre != ''`,
  ], run: async (db) => {
    // Normalise each DISTINCT spelling once rather than each row: a few
    // hundred spellings across thousands of tracks. Safe to repeat — a
    // value already on the list maps to itself.
    const { results } = await db.prepare(`SELECT DISTINCT genre FROM tracks WHERE genre != ''`).bind().all();
    const changes = [];
    for (const r of results || []) {
      const g = String(r.genre);
      const n = normalizeGenre(g).genre;
      if (n !== g) changes.push([g, n]);
    }
    const stmt = db.prepare(`UPDATE tracks SET genre = ?2 WHERE genre = ?1`);
    for (let i = 0; i < changes.length; i += 40) {
      await db.batch(changes.slice(i, i + 40).map(([from, to]) => stmt.bind(from, to)));
    }
  }},
  { id: 19, name: 'mixes', sql: [
    /* A mix is a named, ordered set of tracks that is MEANT to be shown to
       other people — which is what separates it from `playlists`, riffrolled's
       anonymous copy of a DJ AI set that nobody can browse.

         kind 'premade'    added by the owner in the local admin tool
         kind 'community'  shared by a listener with the Share button

       There is no owner column, on purpose: a community mix is anonymous,
       like everything else riffrolled keeps. Abuse is handled by what the
       server CAN see — a per-day count and a report count, both keyed by a
       hash that includes the date, so neither survives as a record of a
       person (mix_shares is pruned after two days).

       fingerprint is a hash of the ordered track ids. Sharing the same set
       twice returns the first one rather than filling the list. */
    `CREATE TABLE IF NOT EXISTS mixes (
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
       created_at TEXT NOT NULL DEFAULT '')`,
    `CREATE INDEX IF NOT EXISTS idx_mixes_list ON mixes(kind, hidden, id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_mixes_fp ON mixes(fingerprint) WHERE fingerprint != ''`,
    `CREATE TABLE IF NOT EXISTS mix_tracks (
       mix_id INTEGER NOT NULL, track_id INTEGER NOT NULL, position INTEGER NOT NULL DEFAULT 0)`,
    `CREATE INDEX IF NOT EXISTS idx_mix_tracks ON mix_tracks(mix_id, position)`,
    `CREATE TABLE IF NOT EXISTS mix_reports (
       mix_id INTEGER NOT NULL, who TEXT NOT NULL, created_at TEXT NOT NULL,
       PRIMARY KEY (mix_id, who))`,
    `CREATE TABLE IF NOT EXISTS mix_shares (
       day TEXT NOT NULL, who TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY (day, who))`,
  ]},

  { id: 20, name: 'mix-brief', sql: [
    /* What a mix was made from. `brief` is the DJ AI choices as a small JSON
       object (activity, feel, direction… plus familiarity and length), written
       by the admin tool for premade mixes and, only when the listener ticks
       the box, by the Share sheet for community ones. It is read back as data
       and shown as chips — never as markup. `note` is the one-line "why this
       track is here" the DJ gave, kept with the track's place in THIS mix
       (the track itself lives in the shared catalogue). Both are optional. */
    `ALTER TABLE mixes ADD COLUMN brief TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE mix_tracks ADD COLUMN note TEXT NOT NULL DEFAULT ''`,
  ]},

  { id: 21, name: 'wallet-public-keys', sql: [
    /* Wallets are filed under a PUBLIC key from now on (see src/wallet.js).
       pub = 1 marks a row filed under its public key; every row that exists
       when this runs is a legacy row filed under its private key (pub = 0),
       and moves itself across the first time its owner turns up. */
    `ALTER TABLE wallets ADD COLUMN pub INTEGER NOT NULL DEFAULT 0`,
  ]},

  { id: 22, name: 'mix-creator', sql: [
    /* Who shared a community mix: the sharer's wallet PUBLIC key (never the
       private key), or '' when none came with the share. Shown to the owner
       in the admin tool so abuse can be traced and cleaned up in one go; it
       is never sent to other listeners. */
    `ALTER TABLE mixes ADD COLUMN creator TEXT NOT NULL DEFAULT ''`,
    `CREATE INDEX IF NOT EXISTS idx_mixes_creator ON mixes(creator, created_at)`,
  ]},

  { id: 23, name: 'share-approval', sql: [
    /* Sharing is earned, once per wallet. Every public key starts at
       sharing = 0 (false): what it shares is kept with pending = 1 — in the
       database, out of every list — until the owner looks at it in the admin
       tool. Approving the key sets sharing = 1 (true) and lists its waiting
       mixes; from then on its shares go straight up. sharing = -1 is a key
       the owner blocked. A key gets a row the first time it tries to share;
       no row means it never has. Mixes already listed are left as they are. */
    `CREATE TABLE IF NOT EXISTS sharers (
       pub        TEXT PRIMARY KEY,
       sharing    INTEGER NOT NULL DEFAULT 0,
       first_at   TEXT NOT NULL DEFAULT '',
       decided_at TEXT NOT NULL DEFAULT ''
     )`,
    `ALTER TABLE mixes ADD COLUMN pending INTEGER NOT NULL DEFAULT 0`,
    `CREATE INDEX IF NOT EXISTS idx_mixes_pending ON mixes(pending, creator)`,
  ]},

  { id: 24, name: 'mix-share-links', sql: [
    /* A mix's share link is riffrolled.com/?m=<slug>. The slug is 8 random
       characters (see newMixSlug in src/routes/mixes.js), never the row
       number: a number can be counted through, a random code can only be
       known by someone who was given it. It is not a secret — anyone who
       has the link can open the mix — but a hidden, pending or deleted mix
       is not found by its slug either. Unique among the mixes that have one. */
    `ALTER TABLE mixes ADD COLUMN slug TEXT NOT NULL DEFAULT ''`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_mixes_slug ON mixes(slug) WHERE slug != ''`,
  ], run: async (db) => {
    // every mix that exists now gets its code (safe to repeat: only blanks are filled)
    const { results } = await db.prepare(`SELECT id FROM mixes WHERE slug = ''`).bind().all();
    for (const r of results || []) {
      for (let tries = 0; tries < 6; tries++) {
        try {
          await db.prepare(`UPDATE mixes SET slug = ?2 WHERE id = ?1 AND slug = ''`).bind(r.id, newMixSlug()).run();
          break;
        } catch (err) { if (!/unique|constraint/i.test(String(err && err.message))) throw err; }
      }
    }
  }},
  { id: 25, name: 'promotion-look', sql: [
    /* How a promoted card looks: its style ('record' or 'poster') and a
       color ('#rrggbb', or '' for the original look). Decoration only; see
       src/cardlook.js. Existing campaigns keep the record they always had. */
    `ALTER TABLE promotions ADD COLUMN style TEXT NOT NULL DEFAULT 'record'`,
    `ALTER TABLE promotions ADD COLUMN color TEXT NOT NULL DEFAULT ''`,
  ] },
  { id: 26, name: 'cooldown-and-sharer', sql: [
    /* One credited contribution of each kind per wallet per cooldown
       (CONTRIB_COOLDOWN_SEC, see src/contrib.js). One row per wallet and
       kind, holding when it last earned. */
    `CREATE TABLE IF NOT EXISTS contrib_cooldown (
       wallet_id TEXT NOT NULL,
       kind      TEXT NOT NULL,
       at        TEXT NOT NULL,
       PRIMARY KEY (wallet_id, kind))`,
    /* A shared mix may show "shared by rr·abc123" (the first characters of
       the sharer's PUBLIC key). Only when the sharer ticked the box: mixes
       shared before this existed were shared on the promise that the key
       is not shown, so they all start at 0. */
    `ALTER TABLE mixes ADD COLUMN show_by INTEGER NOT NULL DEFAULT 0`,
    /* A mix's cover picture: the video id of one of its own tracks, chosen
       in the admin tool. Empty = the first track's picture, as before. */
    `ALTER TABLE mixes ADD COLUMN cover TEXT NOT NULL DEFAULT ''`,
    /* Genre targeting for a pop-up campaign: up to three names from the
       closed genre list (src/genres.js), comma-separated. Empty = shown
       whatever is playing, which is every campaign made before this. */
    `ALTER TABLE promotions ADD COLUMN genres TEXT NOT NULL DEFAULT ''`,
  ] },
  { id: 27, name: 'promo-safety', sql: [
    /* held = 1: the campaign is paid for but not shown until the owner of
       riffrolled has looked at it — a new key's campaigns (PROMO_REVIEW),
       or one that enough listeners reported (PROMO_REPORTS_TO_HOLD). */
    `ALTER TABLE promotions ADD COLUMN held INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE promotions ADD COLUMN reports INTEGER NOT NULL DEFAULT 0`,
    // one report per person per campaign; `who` is a hash, not an address
    `CREATE TABLE IF NOT EXISTS promo_reports (
       promo_id   INTEGER NOT NULL,
       who        TEXT NOT NULL,
       created_at TEXT NOT NULL,
       PRIMARY KEY (promo_id, who))`,
    /* Who has been shown which campaign lately, so the same person is not
       charged for twice within PROMO_REPEAT_HOURS: a credit is one
       person's attention, and a script looping the pop-up from one
       address can no longer drain a campaign. Hashed; pruned weekly. */
    `CREATE TABLE IF NOT EXISTS promo_seen (
       who      TEXT NOT NULL,
       promo_id INTEGER NOT NULL,
       at       TEXT NOT NULL,
       PRIMARY KEY (who, promo_id))`,
  ] },
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
        // a migration that needs code, not just SQL (it must be safe to repeat)
        if (typeof m.run === 'function') {
          try { await m.run(db); }
          catch (err) { throw new Error(`migration ${m.id} (${m.name}) failed: ${err.message}`); }
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
