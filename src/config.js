// ── riffrolled config ─────────────────────────────────────────────────
//
// Every number that steers the economy lives in a D1 row, not in code.
//
// The reason is simple: riffrolled's economy is an experiment, and a number
// you need a deploy to change is not a knob you will actually turn. Mining
// difficulty, what a credit buys, tier discounts, the size of the welcome
// grant — all of it has to be adjustable in seconds, from the admin tool,
// while watching what happens.
//
// THREE LAYERS, most specific first:
//
//   1. the `config` table in D1      — what the admin tool edits
//   2. the matching [vars] entry     — what wrangler.toml still says
//   3. the default in DEFAULTS below — what ships
//
// That order matters on the way in as much as on the way out: a deploy that
// adds a new key works before anyone has set it, and a database that is
// unreachable, mid-migration or empty degrades to exactly the behaviour the
// site had before this file existed. Config is never a reason for the API
// to fall over.
//
// Values are cached per isolate for TTL_MS. A change therefore takes effect
// within about half a minute everywhere, which is the right trade: reads
// cost nothing, and nobody tuning an economy needs the change to land in
// the same millisecond.

/* Every key riffrolled knows about: its default, its type, and the range a
   write has to fall inside. The range is not decoration — this table is the
   only thing standing between a typo in the admin tool and a mining reward
   of one million. A key absent from here cannot be written at all. */
export const SCHEMA = {
  // ── mining ──
  /* Base difficulty is the resting point. The retarget only ever adds to
     it, and the tier discount only ever subtracts, both inside the floor
     and ceiling below:
         effective = clamp(BASE + adjustment − discount, FLOOR, CEIL)   */
  MINE_DIFFICULTY_BITS: { type: 'num', def: 20, min: 8,  max: 30,
    note: 'Base leading zero bits. Each +1 doubles the work per credit. ~1 min at 20.' },
  MINE_REWARD:          { type: 'num', def: 1,  min: 1,  max: 100,
    note: 'Credits minted per solved challenge.' },

  // ── mining: the site-wide brake that replaced the per-wallet cap ──
  MINE_TARGET_PER_HOUR: { type: 'num', def: 60, min: 0,  max: 100000,
    note: 'Credits/hour, site-wide, that difficulty retargets toward. 0 turns retargeting off.' },
  MINE_RETARGET_WINDOW_H: { type: 'num', def: 6, min: 1, max: 168,
    note: 'Hours of mint history the rate is measured over.' },
  MINE_DIFFICULTY_FLOOR:{ type: 'num', def: 16, min: 8,  max: 30,
    note: 'Hard floor. Bounds how far a tier discount can take difficulty down.' },
  MINE_DIFFICULTY_CEIL: { type: 'num', def: 24, min: 8,  max: 30,
    note: 'Hard ceiling, so a phone is never priced out entirely however busy the site gets.' },

  // ── mining: rewarding the people who showed up first ──
  MINE_TIER1_UNTIL:     { type: 'num', def: 1000,  min: 0, max: 10000000,
    note: 'Wallets up to this joining number get TIER1_DISCOUNT fewer bits, for good.' },
  MINE_TIER1_DISCOUNT:  { type: 'num', def: 2,  min: 0,  max: 8,
    note: 'Bits off for the first tier. 2 bits = four times less work per credit.' },
  MINE_TIER2_UNTIL:     { type: 'num', def: 10000, min: 0, max: 10000000,
    note: 'Wallets up to this joining number get TIER2_DISCOUNT fewer bits.' },
  MINE_TIER2_DISCOUNT:  { type: 'num', def: 1,  min: 0,  max: 8,
    note: 'Bits off for the second tier.' },

  // ── promotion ──
  PROMOTE_COST:         { type: 'num', def: 5,  min: 1,  max: 10000,
    note: 'Credits for the minimum campaign, under the current time-based billing.' },
  PROMOTE_HOURS:        { type: 'num', def: 24, min: 1,  max: 8760,
    note: 'Hours bought by PROMOTE_COST credits.' },
  PROMO_SWEEP_HOURS:    { type: 'num', def: 24, min: 1,  max: 8760,
    note: 'Grace period before a spent campaign is deleted. Long enough for the owner’s browser to snapshot its numbers.' },

  /* ── contribution rewards ──
     A fixed pool shared among contributors each epoch, rather than a
     payment per contribution. Nothing here is driven by play or like
     counts: those arrive from the browser and cannot be trusted with
     money. src/contrib.js has the full reasoning. */
  CONTRIB_POOL_PER_EPOCH: { type: 'num', def: 0, min: 0, max: 100000,
    note: 'Credits shared among contributors each epoch. 0 turns rewards off — start here and watch before switching it on.' },
  CONTRIB_EPOCH_HOURS:  { type: 'num', def: 24, min: 1,  max: 168,
    note: 'Length of a reward period. Paid out by the sweeper once the period closes.' },
  CONTRIB_ADD_POINTS:   { type: 'num', def: 2,  min: 0,  max: 1000,
    note: 'Points for being the first to add a track that YouTube confirms exists.' },
  CONTRIB_LINK_POINTS:  { type: 'num', def: 1,  min: 0,  max: 1000,
    note: 'Points for publishing a link between two tracks nobody had linked.' },
  CONTRIB_MAX_POINTS_PER_EPOCH: { type: 'num', def: 40, min: 1, max: 100000,
    note: 'Ceiling per wallet per epoch, so one prolific adder cannot take the whole pool.' },

  // ── link verification (shipped, live) ──
  VERIFY_LINKS:         { type: 'bool', def: true,
    note: 'Ask YouTube whether a video exists before it joins the catalogue.' },
  VERIFY_MAX_CHECKS:    { type: 'num', def: 24, min: 0,  max: 45,
    note: 'Live oEmbed checks per request. The free plan allows 50 external subrequests in total.' },

  // ── AI DJ resolution (dormant) ──
  AI_YT_DAILY:          { type: 'num', def: 40, min: 0,  max: 100,
    note: 'YouTube search.list calls a day, site-wide. Each costs 100 of 10,000 quota units.' },
  AI_YT_PER_REQUEST:    { type: 'num', def: 8,  min: 0,  max: 30,
    note: 'YouTube searches allowed within one resolve request.' },

  /* ── not wired up yet ───────────────────────────────────────────────
     Seeded now so the admin tool can show them, the ranges are agreed
     before anything depends on them, and the step that implements each
     one has a value waiting rather than inventing a literal. Nothing
     reads these today. */
  CREDITS_PER_ATTENTION:  { type: 'num', def: 1, min: 1, max: 100,
    note: 'NOT YET LIVE. One credit = one person’s attention, on every surface.' },
  FIRST_RUN_GRANT:        { type: 'num', def: 0, min: 0, max: 1000,
    note: 'NOT YET LIVE. Credits given on a first visit. 0 until the grant is built.' },
  AI_CANDIDATES_PER_BRIEF:{ type: 'num', def: 3, min: 0, max: 10,
    note: 'NOT YET LIVE. Promoted tracks offered in a DJ AI brief.' },
  POPUP_MIN_GAP_SEC:      { type: 'num', def: 180, min: 30, max: 7200,
    note: 'NOT YET LIVE. Minimum seconds between promotional cards.' },
  POPUP_MAX_PER_HOUR:     { type: 'num', def: 12, min: 1, max: 120,
    note: 'NOT YET LIVE. Ceiling on cards shown to one listener in an hour.' },
};

/* MINE_DAILY_CAP was here and is deliberately gone, not merely ignored —
   an unknown key is refused by validate(), so a stale row or a leftover
   wrangler var now fails loudly in the admin tool instead of looking
   like a dial that does something. The reasoning is in migration 15. */

/** The handful the browser legitimately needs. Everything else stays server-side:
 *  a tuning knob is not a secret, but it is nobody's business either. */
export const PUBLIC_KEYS = [
  'MINE_DIFFICULTY_BITS', 'MINE_REWARD',
  'PROMOTE_COST', 'PROMOTE_HOURS',
];

const TTL_MS = 30_000;

/* Per-isolate cache. Workers spin up and down constantly, so this is a
   short-lived best-effort thing, which is exactly what it should be. */
let cache = null;
let cachedAt = 0;
let inflight = null;

/** Drop the cache — for tests, and after an admin write in the same isolate. */
export function invalidate() { cache = null; cachedAt = 0; inflight = null; }

async function load(db) {
  const now = Date.now();
  if (cache && now - cachedAt < TTL_MS) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    let rows = [];
    try {
      const res = await db.prepare(`SELECT key, value FROM config`).all();
      rows = res.results || [];
    } catch (e) {
      // No table yet (first deploy, mid-migration) or D1 unavailable. Not an
      // error: every caller falls through to vars and then to DEFAULTS, so
      // the site behaves exactly as it did before config existed.
      rows = [];
    }
    const map = Object.create(null);
    for (const r of rows) map[r.key] = r.value;
    cache = map;
    cachedAt = Date.now();
    inflight = null;
    return map;
  })();

  try { return await inflight; } finally { inflight = null; }
}

function coerce(key, raw) {
  const spec = SCHEMA[key];
  if (!spec || raw === undefined || raw === null || raw === '') return undefined;
  if (spec.type === 'bool') {
    const s = String(raw).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(s)) return true;
    if (['0', 'false', 'no', 'off'].includes(s)) return false;
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;              // garbage -> fall through
  if (spec.min !== undefined && n < spec.min) return undefined;
  if (spec.max !== undefined && n > spec.max) return undefined;
  return spec.type === 'num' ? Math.floor(n) : n;
}

/**
 * The whole configuration, resolved. One D1 read per isolate per TTL.
 * @returns {Promise<Object>} every key in SCHEMA, always a usable value
 */
export async function getConfig(env) {
  const stored = env && env.DB ? await load(env.DB) : {};
  const out = {};
  for (const key of Object.keys(SCHEMA)) {
    out[key] = coerce(key, stored[key])                     // 1. the database
            ?? coerce(key, env && env[key])                 // 2. wrangler.toml
            ?? SCHEMA[key].def;                             // 3. what ships
  }
  return out;
}

/** Where each key's live value is coming from — for the admin tool, so a
 *  number that looks wrong can be traced to the layer that set it. */
export async function configSources(env) {
  const stored = env && env.DB ? await load(env.DB) : {};
  const out = {};
  for (const key of Object.keys(SCHEMA)) {
    out[key] = coerce(key, stored[key]) !== undefined ? 'db'
             : coerce(key, env && env[key]) !== undefined ? 'var'
             : 'default';
  }
  return out;
}

/**
 * Validate one write. Returns `{ ok, value }` or `{ ok: false, error }`.
 *
 * Nothing in the Worker calls this — writes happen in the admin tool, which
 * mirrors these rules. It stays here because SCHEMA is the single source of
 * truth for what a legal value is, and because the self-tests check the
 * ranges through it. If an admin endpoint is ever added, this is what it
 * must use.
 * Deliberately strict: an unknown key is refused outright rather than
 * stored and ignored, because a silently-ignored setting is worse than a
 * rejected one — you think you turned the dial and you didn't.
 */
export function validate(key, raw) {
  const spec = SCHEMA[key];
  if (!spec) return { ok: false, error: `Unknown setting "${key}"` };

  if (spec.type === 'bool') {
    const v = coerce(key, raw);
    if (v === undefined) return { ok: false, error: `${key} must be true or false` };
    return { ok: true, value: v ? '1' : '0' };
  }

  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false, error: `${key} must be a number` };
  if (spec.min !== undefined && n < spec.min) {
    return { ok: false, error: `${key} must be at least ${spec.min}` };
  }
  if (spec.max !== undefined && n > spec.max) {
    return { ok: false, error: `${key} must be at most ${spec.max}` };
  }
  return { ok: true, value: String(Math.floor(n)) };
}
