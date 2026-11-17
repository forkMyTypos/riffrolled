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
  CONTRIB_COOLDOWN_SEC: { type: 'num', def: 300, min: 0, max: 86400,
    note: 'Seconds between credited contributions of the same kind (add / link) for one wallet. 0 = no cooldown.' },

  // ── link verification (shipped, live) ──
  VERIFY_LINKS:         { type: 'bool', def: true,
    note: 'Ask YouTube whether a video exists before it joins the catalogue.' },
  VERIFY_MAX_CHECKS:    { type: 'num', def: 24, min: 0,  max: 45,
    note: 'Live oEmbed checks per request. The free plan allows 50 external subrequests in total.' },

  // ── mixes ──
  MIX_SHARE_PER_DAY:    { type: 'num', def: 5, min: 0, max: 1000,
    note: 'Mixes one person (one network address) may share a day. 0 switches sharing off.' },
  MIX_SHARE_REVIEW:     { type: 'bool', def: true,
    note: 'Each wallet’s shares wait for your OK in the admin tool (Mixes → Waiting) until you approve that wallet once. Off = every share is listed straight away.' },
  MIX_REPORTS_TO_HIDE:  { type: 'num', def: 3, min: 1, max: 100,
    note: 'Different people who must report a community mix before it hides itself. You can still hide or restore any mix in the admin tool.' },
  MIX_MIN_TRACKS:       { type: 'num', def: 3, min: 1, max: 20,
    note: 'Fewest tracks a shared mix may have. A one-track mix is a link, not a mix.' },

  // ── promotion safety ──
  PROMO_REVIEW:         { type: 'bool', def: true,
    note: 'A key\'s campaigns wait for your OK (admin → Promotions) until you approve the key once — the same approval as sharing mixes.' },
  PROMO_REPORTS_TO_HOLD:{ type: 'num', def: 3, min: 1, max: 100,
    note: 'Different people who must report a promoted card before its campaign is held for you to look at.' },
  PROMO_REPEAT_HOURS:   { type: 'num', def: 6, min: 0, max: 168,
    note: 'One person (network address) is shown — and charged for — the same campaign at most once in this many hours. 0 = off.' },

  // ── YouTube search from the Search panel ──
  SEARCH_YT_DAILY:      { type: 'num', def: 30, min: 0, max: 100,
    note: 'YouTube searches a day, site-wide, when /api/search falls through to YouTube. Each costs 100 of 10,000 quota units. 0 = catalogue only.' },

  // ── AI DJ resolution (dormant) ──
  AI_YT_DAILY:          { type: 'num', def: 50, min: 0,  max: 100,
    note: 'YouTube search.list calls a day, site-wide. Each costs 100 of 10,000 quota units.' },
  AI_YT_PER_REQUEST:    { type: 'num', def: 8,  min: 0,  max: 30,
    note: 'YouTube searches allowed within one resolve request.' },

  // ── the hourly job's outside requests (refresh, channels, grower share them) ──
  CRON_CALLS:           { type: 'num', def: 45, min: 5, max: 900,
    note: 'YouTube calls one hourly run may make. The free Workers plan allows 50 outside requests a run; on the $5 plan this can go to a few hundred.' },

  // ── whole channels (src/channels.js, hourly) ──
  CHANNEL_ON:           { type: 'bool', def: true,
    note: 'Find channels behind catalogue tracks, and import the approved ones.' },
  CHANNEL_UNITS_DAILY:  { type: 'num', def: 2000, min: 0, max: 9000,
    note: 'YouTube quota units a day for channels. ~2 units per 50 tracks, so 2,000 ≈ 50,000 tracks.' },
  CHANNELS_PER_RUN:     { type: 'num', def: 2, min: 1, max: 20,
    note: 'Approved channels read per hourly run.' },
  CHANNEL_PAGES_PER_RUN:{ type: 'num', def: 8, min: 1, max: 200,
    note: 'Pages of 50 read from one channel per run while catching up (each costs ~2 outside requests).' },
  CHANNEL_MAX_TRACKS:   { type: 'num', def: 1000, min: 50, max: 20000,
    note: 'Newest uploads read from a channel the first time. After that, only new uploads.' },
  CHANNEL_AUTO_TOPIC:   { type: 'bool', def: true,
    note: '"Artist - Topic" channels (only songs) approve themselves once CHANNEL_AUTO_LIKES of their tracks are liked here. Off = you approve every channel.' },
  CHANNEL_AUTO_LIKES:   { type: 'num', def: 3, min: 1, max: 1000,
    note: 'Likes here before a Topic channel approves itself.' },

  // ── the 30-day refresh (src/refresh.js, hourly) ──
  REFRESH_ON:           { type: 'bool', def: true,
    note: 'Re-check catalogue tracks with YouTube so nothing is older than REFRESH_DAYS (YouTube’s 30-day rule).' },
  REFRESH_DAYS:         { type: 'num', def: 25, min: 1, max: 30,
    note: 'Every track is re-checked at least this often. Under 30 leaves room for missed runs.' },
  REFRESH_MAX_CALLS:    { type: 'num', def: 20, min: 1, max: 40,
    note: 'videos.list calls per hourly run (50 tracks and 1 quota unit each). 20 = up to 24,000 tracks a day.' },

  // ── the catalogue grower (src/grow.js, hourly) ──
  GROW_ON:              { type: 'bool', def: true,
    note: 'Each hour, import YouTube playlists for the styles auto mixes came back short on, and for thin genres.' },
  GROW_UNITS_DAILY:     { type: 'num', def: 1500, min: 0, max: 9000,
    note: 'YouTube quota units the grower may spend a day (of the key’s 10,000). ~120 units ≈ up to 150 new tracks.' },
  GROW_STYLES_PER_RUN:  { type: 'num', def: 2,   min: 1, max: 4,
    note: 'Styles grown per hourly run. Kept small: a free-plan Worker gets 50 outside requests per run.' },
  GROW_TRACKS_PER_STYLE:{ type: 'num', def: 150, min: 20, max: 1000,
    note: 'Tracks read from playlists per style per run, before the checks.' },
  GROW_MIN_GENRE:       { type: 'num', def: 80,  min: 0, max: 100000,
    note: 'A broad genre with fewer verified tracks than this is grown even if nobody asked. 0 = only grow what people asked for.' },
  GROW_MAX_MINUTES:     { type: 'num', def: 12,  min: 3, max: 60,
    note: 'Longer videos (mixes, loops, live sets) are left out.' },

  // ── auto mix: riffrolled's own AI makes the mix (routes/automix.js) ──
  AUTOMIX_ON:           { type: 'bool', def: true,
    note: 'Listeners can ask riffrolled itself for a mix (DJ AI → Simple → Make my mix). Off hides nothing; it says it is resting.' },
  AUTOMIX_PER_DAY:      { type: 'num', def: 3,   min: 0, max: 100,
    note: 'Auto mixes a day for each visitor.' },
  AUTOMIX_DAILY:        { type: 'num', def: 50, min: 0, max: 100000,
    note: 'Auto mixes a day, whole site. The cap on what paid AI can cost: about 50 mixes a day stays inside the free link-finding allowances.' },
  AUTOMIX_NEW:          { type: 'num', def: 4,   min: 0, max: 8,
    note: 'New tracks one auto mix may look up on YouTube (shares AI_YT_DAILY). Doubled when the catalogue has almost nothing for the request.' },
  // ── the AI steps of an auto mix (admin tool → AI tab). Models are
  //    "provider:model", a chain is tried left to right: see src/ai/models.js ──
  AI_PICKER:            { type: 'text', def: 'anthropic:claude-haiku-5-5 | workers:@cf/meta/llama-3.3-70b-instruct-fp8-fast', max: 500,
    note: 'Who picks the songs, from what it knows about music. First usable model in the chain answers.' },
  AI_HUNTER:            { type: 'text', def: 'gemini:gemini-3.6-flash', max: 500,
    note: 'Link Hunter: a model that searches the web for each song\'s YouTube link. Needs one with web search (not workers).' },
  LINK_STEPS:           { type: 'text', def: 'catalogue,guess,discogs,youtube,brave,hunt', max: 200,
    note: 'How a picked song gets its link, in order; each step only sees the songs still without one. Free: catalogue · guess (the picker\'s own guess, checked with oEmbed) · discogs · youtube (search.list, 100 quota units) · brave (free credit) · musicbrainz. Paid: serper · hunt (Link Hunter).' },
  AI_HUNT_SEARCHES:     { type: 'num', def: 3, min: 1, max: 30,
    note: 'Most web searches the Link Hunter may run for one mix.' },
  AI_HUNT_MAX:          { type: 'num', def: 3, min: 1, max: 30,
    note: 'Most songs handed to the Link Hunter in one mix.' },
  AI_SERPER_MAX:        { type: 'num', def: 10, min: 0, max: 30,
    note: 'Most Serper searches for one mix (about $0.001 each).' },
  AI_DISCOGS_MAX:       { type: 'num', def: 6, min: 0, max: 15,
    note: 'Most songs looked up on Discogs in one mix (two free calls each, 60 a minute).' },
  AI_BRAVE_MAX:         { type: 'num', def: 6, min: 0, max: 20,
    note: 'Most Brave searches in one mix.' },
  AI_BRAVE_MONTHLY:     { type: 'num', def: 900, min: 0, max: 100000,
    note: 'Most Brave searches a month, whole site. Brave gives $5 of credit a month (about 1,000 searches) and then charges with no cap, so stay under 1,000 to keep it free.' },
  AI_MB_MAX:            { type: 'num', def: 3, min: 0, max: 8,
    note: 'Most songs looked up on MusicBrainz in one mix (it allows one request a second).' },
  AI_CALL_BUDGET:       { type: 'num', def: 40, min: 10, max: 900,
    note: 'Outside requests the link steps may make for one mix. The Workers free plan allows 50 per request in all; on the $5 plan raise it (up to about 900).' },
  AI_PICK_HINTS:        { type: 'num', def: 60, min: 0, max: 120,
    note: 'Catalogue tracks that clearly match the request, shown to the picker as songs it may reuse (they need no lookup).' },
  AI_PICKER_PROMPT:     { type: 'text', def: '', max: 8000,
    note: 'Instructions for the picker. Empty = the built-in prompt.' },
  AI_HUNTER_PROMPT:     { type: 'text', def: '', max: 8000,
    note: 'Instructions for the Link Hunter. Empty = the built-in prompt.' },
  AI_ANTHROPIC_SEARCH_TOOL: { type: 'text', def: 'web_search_20250305', max: 60,
    note: 'Anthropic web search tool version.' },
  AUTOMIX_BLOCKS:       { type: 'num', def: 2,   min: 1, max: 50,
    note: 'Different listeners who must find a track blocked in an auto mix before auto mixes stop choosing it. It stays in the catalogue.' },
  AUTOMIX_CHECK:        { type: 'bool', def: true,
    note: 'Check a finished auto mix with videos.list (1 quota unit per mix): public, embeddable, 1 to GROW_MAX_MINUTES minutes. Failures are swapped for other catalogue tracks.' },

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
  if (spec.type === 'text') return String(raw).slice(0, spec.max || 2000);
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

  if (spec.type === 'text') {
    const v = String(raw == null ? '' : raw);
    if (v.length > (spec.max || 2000)) return { ok: false, error: `${key} is longer than ${spec.max} characters` };
    return { ok: true, value: v };
  }
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
