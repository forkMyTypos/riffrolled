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
  /* seq is the wallet's joining number, which is what the early-user
     tiers are defined in terms of. Computed in the INSERT so a new wallet
     gets one without a second round trip.

     Two wallets created in the same instant can be handed the same seq.
     That is left alone on purpose: seq decides which side of a tier
     boundary you fall on, nothing is keyed by it, and one duplicate at
     wallet #1000 costs somebody one bit. A unique index would buy
     accuracy nobody can perceive at the price of a failed insert on the
     busiest possible moment. */
  await db.prepare(
    `INSERT INTO wallets (id, created_at, seq)
     VALUES (?1, ?2, (SELECT IFNULL(MAX(seq), 0) + 1 FROM wallets))
     ON CONFLICT(id) DO NOTHING`
  ).bind(id, now).run();
}

/** The wallet's joining number, or null if it somehow has none. */
export async function walletSeq(db, id) {
  const row = await db.prepare(`SELECT seq FROM wallets WHERE id = ?1`).bind(id).first();
  return row && row.seq != null ? row.seq : null;
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

/* ── the site-wide mint rate ──────────────────────────────────────────
   The rate could be counted from the ledger, and at today's volumes it
   would be fine. It is counted into an hourly bucket instead because the
   ledger grows forever and this query runs on every challenge: a COUNT
   over a date range gets slower every month, while one row per hour over
   a six-hour window is six rows no matter how old the site is.
   It also stores no wallet, so measuring the economy reads nothing
   about who is in it. */

/** `n` more credits minted, in the UTC hour `now` falls in. One write. */
export async function bumpMintRate(db, now, n = 1) {
  const hour = String(now).slice(0, 13);              // YYYY-MM-DDTHH
  const add = Math.max(1, Math.floor(Number(n) || 1));
  await db.prepare(
    `INSERT INTO mint_rate (hour, mints) VALUES (?1, ?2)
     ON CONFLICT(hour) DO UPDATE SET mints = mints + ?2`
  ).bind(hour, add).run();
}

/**
 * Credits per hour over the last `hours` complete-or-current UTC hours.
 * Divides by hours elapsed rather than hours counted, so a window that
 * is only half full reports the rate it actually saw instead of half it.
 */
export async function recentMintRate(db, now, hours) {
  const span = Math.max(1, Math.floor(hours));
  const from = new Date(Date.parse(now) - (span - 1) * 3600_000).toISOString().slice(0, 13);
  const upto = String(now).slice(0, 13);
  /* Bounded at both ends. The upper bound is not theoretical: hour keys
     sort as strings, so without it any bucket stamped later than now —
     clock skew between isolates, or a row written by a test or a backfill
     — would be counted as part of the current rate and could push
     difficulty up over mints that have not happened yet. */
  const row = await db.prepare(
    `SELECT COALESCE(SUM(mints), 0) AS n, COUNT(*) AS buckets
       FROM mint_rate WHERE hour >= ?1 AND hour <= ?2`
  ).bind(from, upto).first();
  const n = (row && row.n) || 0;
  if (!n) return 0;
  // the current hour counts as one whether it is a minute or an hour old:
  // under-counting elapsed time overstates the rate, which errs toward
  // raising difficulty rather than lowering it
  const elapsed = Math.max(1, Math.min(span, (row && row.buckets) || 1));
  return n / elapsed;
}

/** Drop buckets older than a week. Called on retarget, so at most hourly. */
export async function pruneMintRate(db, now) {
  const cutoff = new Date(Date.parse(now) - 7 * 24 * 3600_000).toISOString().slice(0, 13);
  await db.prepare(`DELETE FROM mint_rate WHERE hour < ?1`).bind(cutoff).run();
}

/** The retarget controller's state: `{ adjustment, rate, changed_at }`. */
export async function getMineState(db) {
  const row = await db.prepare(
    `SELECT adjustment, rate, changed_at FROM mine_state WHERE id = 1`
  ).first();
  return row || { adjustment: 0, rate: 0, changed_at: '' };
}

/**
 * Move the adjustment, but only if nobody else just did.
 *
 * `WHERE changed_at = ?` makes this the same trick as spendCredit: two
 * isolates retargeting at once means the second one's UPDATE matches
 * nothing and it simply does not apply its step. Without that the
 * adjustment could jump several bits in one second from one rate reading.
 */
export async function setMineAdjustment(db, adjustment, rate, now, prevChangedAt) {
  const res = await db.prepare(
    `UPDATE mine_state SET adjustment = ?1, rate = ?2, changed_at = ?3
      WHERE id = 1 AND changed_at = ?4`
  ).bind(adjustment, rate, now, prevChangedAt || '').run();
  return !!(res.meta && res.meta.changes);
}

/** Record the observed rate without moving the adjustment. */
export async function setMineRate(db, rate) {
  await db.prepare(`UPDATE mine_state SET rate = ?1 WHERE id = 1`).bind(rate).run();
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
/**
 * The owner's own campaigns, with everything the panel draws.
 *
 * This column list is load-bearing. It used to end at `remaining_ms` and
 * decide `live` from `expires_at`, both of which stopped meaning anything
 * when campaigns started being sold by attention instead of by the hour.
 * The panel had already moved on and was reading credits_remaining,
 * dislikes and label — none of which were selected — so every campaign an
 * owner had rendered as "ended · spent" with no pause button. Nothing
 * threw: SQLite simply did not return the columns and `Number(undefined
 * || 0)` is 0.
 *
 * A query that silently returns fewer fields than its only caller reads
 * is not a class of bug a type system was going to catch here, so there
 * is a test that walks the fields the panel reads and asserts the API
 * returns each one.
 */
export async function walletPromotions(db, walletId, now, limit = 25) {
  const { results } = await db.prepare(
    `SELECT id, url, name, label, modes, tags,
            created_at, ended_at,
            views, plays, likes, dislikes, replays,
            tokens, credits_remaining, paused,
            CASE WHEN credits_remaining > 0 AND paused = 0
                  AND (expires_at = '' OR expires_at > ?2)
                 THEN 1 ELSE 0 END AS live
       FROM promotions WHERE wallet_id = ?1
      ORDER BY created_at DESC LIMIT ?3`
  ).bind(walletId, now, limit).all();
  return results || [];
}

/**
 * Campaigns that ran out long enough ago to be swept.
 *
 * `ended_at` is set by spendCredit when the last credit goes, so this is
 * "spent, and spent a while back". The grace period exists so the owner's
 * browser has a chance to take its local snapshot before the row goes —
 * the numbers belong to them, and a sweeper that beat them to it would be
 * deleting their record of what they paid for.
 */
export async function sweepableCampaigns(db, now, graceHours = 24, limit = 200) {
  const cutoff = new Date(Date.parse(now) - graceHours * 3600_000).toISOString();
  const { results } = await db.prepare(
    `SELECT id FROM promotions
      WHERE credits_remaining <= 0 AND ended_at != '' AND ended_at < ?1
      LIMIT ?2`
  ).bind(cutoff, limit).all();
  return (results || []).map((r) => r.id);
}

/** Delete campaigns and the brief offers that pointed at them. */
export async function deleteCampaigns(db, ids) {
  if (!ids.length) return 0;
  const holes = ids.map((_, i) => '?' + (i + 1)).join(',');
  // offers first: a row in brief_offers naming a campaign that no longer
  // exists could never be charged, but it could still be counted
  await db.prepare(`DELETE FROM brief_offers WHERE promotion_id IN (${holes})`).bind(...ids).run();
  const res = await db.prepare(`DELETE FROM promotions WHERE id IN (${holes})`).bind(...ids).run();
  return (res.meta && res.meta.changes) || 0;
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

/* ── campaigns (consumption billing) ──────────────────────────────────
   A credit buys one person's attention. These are the queries that spend
   it, and the important property is that the SERVER decides who gets shown
   and debits as it decides. Nothing the browser reports can move a
   balance — which is what stops one person draining a rival's campaign
   with a curl loop. */

/** Campaigns that can still be shown: credits left, not paused, not expired. */
export async function livePromotions(db, now, limit = 20, mode = 'popup') {
  const { results } = await db.prepare(
    `SELECT id, url, name, label, modes, expires_at, views, plays, likes, dislikes,
            replays, tokens, credits_remaining
       FROM promotions
      WHERE credits_remaining > 0 AND paused = 0
        AND (expires_at = '' OR expires_at > ?1)
        AND (',' || modes || ',') LIKE ?2
      ORDER BY credits_remaining DESC, created_at DESC
      LIMIT ?3`
  ).bind(now, `%,${mode},%`, limit).all();
  return results || [];
}

/**
 * Spend exactly one credit on one campaign, and only if it still has one.
 *
 * The `credits_remaining > 0` in the WHERE clause is the whole safety
 * mechanism: two simultaneous requests cannot both debit the last credit,
 * because the second one's UPDATE matches no row. `changes` tells the
 * caller whether they actually got it.
 */
export async function spendCredit(db, id, now) {
  const res = await db.prepare(
    `UPDATE promotions
        SET credits_remaining = credits_remaining - 1, views = views + 1,
            ended_at = CASE WHEN credits_remaining - 1 <= 0 THEN ?2 ELSE ended_at END
      WHERE id = ?1 AND credits_remaining > 0 AND paused = 0`
  ).bind(id, now).run();
  return !!(res.meta && res.meta.changes);
}

/** Engagement counters a campaign's owner sees. Never money. */
export async function bumpCampaignStat(db, id, kind) {
  const col = kind === 'like' ? 'likes' : kind === 'dislike' ? 'dislikes'
            : kind === 'replay' ? 'replays' : 'plays';
  const res = await db.prepare(`UPDATE promotions SET ${col} = ${col} + 1 WHERE id = ?1`)
    .bind(id).run();
  return !!(res.meta && res.meta.changes);
}

/** A wallet's live campaign for this url, if any — one per track per owner. */
export async function liveCampaignFor(db, walletId, url, now) {
  return db.prepare(
    `SELECT * FROM promotions
      WHERE wallet_id = ?1 AND url = ?2 AND credits_remaining > 0 AND paused = 0
        AND (expires_at = '' OR expires_at > ?3) LIMIT 1`
  ).bind(walletId, url, now).first();
}

export async function addCredits(db, id, n) {
  await db.prepare(
    `UPDATE promotions SET credits_remaining = credits_remaining + ?2, tokens = tokens + ?2,
            ended_at = '' WHERE id = ?1`
  ).bind(id, n).run();
}

/** Record that a brief offered a campaign, so copying it twice can't charge
 *  twice. Returns true the first time only. */
/* ── brief offers: the two halves of an AI placement ──────────────────
   A placement happens in two steps separated by however long the person
   spends in ChatGPT, so it is recorded in two steps too.

   offerBriefCandidate  when the brief is built. charged = 0. Nothing is
                        billed: the brief may never be copied.
   claimBriefOffer      when the brief is copied. 0 → 1, atomically.

   The offer has to be written first. The alternative — have the copy
   call name the campaigns it is paying for — is the drain attack step 3
   closed: anyone could POST a rival's campaign id and spend their
   credits. Writing the offer means the server decided who was in that
   brief, and the claim can only charge what the server itself offered. */

/** Offer a campaign in a brief. Idempotent: rebuilding a brief re-offers
 *  the same campaigns without resetting an already-charged row. */
export async function offerBriefCandidate(db, briefId, promotionId, now) {
  const res = await db.prepare(
    `INSERT INTO brief_offers (brief_id, promotion_id, charged, at) VALUES (?1, ?2, 0, ?3)
       ON CONFLICT(brief_id, promotion_id) DO NOTHING`
  ).bind(briefId, promotionId, now).run();
  return !!(res.meta && res.meta.changes);
}

/** Everything offered in this brief that has not been charged yet. */
export async function unchargedOffers(db, briefId) {
  const { results } = await db.prepare(
    `SELECT promotion_id FROM brief_offers WHERE brief_id = ?1 AND charged = 0`
  ).bind(briefId).all();
  return (results || []).map((r) => r.promotion_id);
}

/**
 * Mark one offer charged, once.
 *
 * `WHERE charged = 0` is what makes copying the same brief twice free the
 * second time: the second claim's UPDATE matches nothing and no credit
 * moves. Two simultaneous claims race on the same row and exactly one
 * wins, which is the same guarantee as spendCredit.
 */
export async function claimBriefOffer(db, briefId, promotionId) {
  const res = await db.prepare(
    `UPDATE brief_offers SET charged = 1
      WHERE brief_id = ?1 AND promotion_id = ?2 AND charged = 0`
  ).bind(briefId, promotionId).run();
  return !!(res.meta && res.meta.changes);
}

/** Drop offers nobody came back for. Called on a sample of requests. */
export async function pruneBriefOffers(db, now, hours = 24) {
  const cutoff = new Date(Date.parse(now) - hours * 3600_000).toISOString();
  await db.prepare(
    `DELETE FROM brief_offers WHERE charged = 0 AND at < ?1`
  ).bind(cutoff).run();
}

/**
 * Live campaigns that asked for the AI surface, with their tags.
 *
 * Returns the whole live AI pool rather than filtering by tag in SQL. The
 * pool is small (one live campaign per track per owner, and only those
 * with credits left), and scoring in JS keeps the ranking rule in one
 * readable place in src/tags.js instead of spread across a LIKE clause
 * per tag. If the pool ever stops being small, this is the query to
 * change — not the scoring.
 */
export async function aiCampaignPool(db, now, limit = 200) {
  const { results } = await db.prepare(
    `SELECT id, url, name, label, tags, credits_remaining
       FROM promotions
      WHERE paused = 0
        AND credits_remaining > 0
        AND (',' || modes || ',') LIKE '%,ai,%'
        AND (expires_at = '' OR expires_at > ?1)
      ORDER BY credits_remaining DESC
      LIMIT ?2`
  ).bind(now, limit).all();
  return results || [];
}

/* ── contribution points ─────────────────────────────────────────────
   See src/contrib.js. Points are recorded as they are earned and paid
   out as a share of a fixed pool once the epoch closes. */

/**
 * Add points, stopping at the per-epoch ceiling. Returns what was added.
 *
 * The cap is applied in SQL rather than by reading, adding and writing
 * back, so two requests landing together cannot both read 49 and both
 * write 50. `MIN(points + ?, cap)` is evaluated by SQLite against the row
 * it is actually updating.
 */
export async function addContribPoints(db, walletId, epoch, points, cap, now) {
  const add = Math.max(0, Math.floor(points));
  const ceiling = Math.max(0, Math.floor(cap));
  if (!add || !ceiling) return 0;

  await db.prepare(
    `INSERT INTO contrib (wallet_id, epoch, points, updated_at)
     VALUES (?1, ?2, MIN(?3, ?4), ?5)
     ON CONFLICT(wallet_id, epoch) DO UPDATE
       SET points = MIN(points + ?3, ?4), updated_at = ?5`
  ).bind(walletId, epoch, add, ceiling, now).run();

  const row = await db.prepare(
    `SELECT points FROM contrib WHERE wallet_id = ?1 AND epoch = ?2`
  ).bind(walletId, epoch).first();
  return (row && row.points) || 0;
}

/** Total points and contributor count for one epoch. */
export async function epochTotals(db, epoch) {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(points), 0) AS points, COUNT(*) AS wallets
       FROM contrib WHERE epoch = ?1`
  ).bind(epoch).first();
  return { points: (row && row.points) || 0, wallets: (row && row.wallets) || 0 };
}

export async function walletsInEpoch(db, epoch, limit = 5000) {
  const { results } = await db.prepare(
    `SELECT wallet_id, points FROM contrib
      WHERE epoch = ?1 AND points > 0 ORDER BY points DESC LIMIT ?2`
  ).bind(epoch, limit).all();
  return results || [];
}

/** Claim an epoch for payment. False means somebody already has it. */
export async function markEpochPaid(db, epoch, now) {
  const res = await db.prepare(
    `INSERT INTO contrib_paid (epoch, paid_at) VALUES (?1, ?2)
       ON CONFLICT(epoch) DO NOTHING`
  ).bind(epoch, now).run();
  return !!(res.meta && res.meta.changes);
}

export async function isEpochPaid(db, epoch) {
  return !!(await db.prepare(`SELECT 1 FROM contrib_paid WHERE epoch = ?1`).bind(epoch).first());
}

/** What a wallet has earned this epoch so far, for showing them. */
export async function contribStanding(db, walletId, epoch) {
  const mine = await db.prepare(
    `SELECT points FROM contrib WHERE wallet_id = ?1 AND epoch = ?2`
  ).bind(walletId, epoch).first();
  const all = await epochTotals(db, epoch);
  return { points: (mine && mine.points) || 0, total: all.points, contributors: all.wallets };
}

/** Drop point rows from epochs long since paid. Paid markers are kept. */
export async function pruneContrib(db, now, hoursBack) {
  const cutoff = new Date(Date.parse(now) - Math.max(24, hoursBack) * 3600_000)
    .toISOString().slice(0, 10);
  await db.prepare(`DELETE FROM contrib WHERE epoch < ?1`).bind(cutoff).run();
}

/** Set a campaign's tags (owner action). */
export async function setCampaignTags(db, id, tags) {
  await db.prepare(`UPDATE promotions SET tags = ?2 WHERE id = ?1`).bind(id, tags).run();
}

/** Create a campaign. `credits` is what it can spend; `expires_at` is left
 *  empty because credits, not the clock, end a campaign now. */
export async function addCampaign(db, c) {
  const res = await db.prepare(
    `INSERT INTO promotions
       (wallet_id, url, name, label, modes, created_at, expires_at, tokens,
        credits_remaining, plays, likes, dislikes, replays, views, paused, remaining_ms, ended_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, '', ?7, ?7, 0, 0, 0, 0, 0, 0, 0, '')`
  ).bind(c.wallet, c.url, String(c.name || '').slice(0, 300), c.label, c.modes, c.now, c.credits).run();
  return Number(res.meta && res.meta.last_row_id) || 0;
}
