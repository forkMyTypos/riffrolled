// ── guard: per-visitor rate limits and a short edge cache for /api/* ──
//
// Why this exists (20 Nov 2026): an AI asked to "road-test the site as
// hard as it can" used up D1's free 5,000,000 rows read in a day. Most
// API calls are cheap, but a text search that finds nothing has to look
// at every track (LIKE '%word%' can't use an index and LIMIT can't stop
// early), so a few hundred nonsense searches cost millions of rows.
//
// Two layers, both in front of every route:
//
//   1. RATE LIMITS (Workers Rate Limiting bindings, wrangler.toml)
//      RL_API    every /api/* call, per visitor
//      RL_HEAVY  the calls that can read a whole table (see HEAVY), per
//                visitor, on top of RL_API
//      A "visitor" is a network address; an IPv6 address counts by its
//      /64, since one home or phone is handed a whole /64 and could
//      otherwise rotate through it. Counters are per Cloudflare location,
//      so these are a brake, not an exact count. Over the limit: 429
//      with Retry-After. If a binding is missing (local tests) or fails,
//      the request goes through — a broken limiter must not take the
//      site down.
//
//   2. EDGE CACHE (caches.default, riffrolled.com only — not workers.dev)
//      Answers that are the same for everybody (CACHEABLE) are kept at
//      the Cloudflare location for a minute or so. The same search or
//      list asked again costs no database reads and is not counted
//      against anyone's limit. Only clean 200s are kept; anything sent
//      with a wallet key, or carrying a warning header, is never kept.
//      The browser still gets a fresh-looking response (no Cache-Control
//      added) — only the edge copy has a lifetime.
//
// /api/health is left alone: the admin tool's deploy page polls it.

/** Calls that can read a whole table. [method, path, extra test] */
const HEAVY = [
  ['GET',  /^\/api\/search$/],
  ['GET',  /^\/api\/tracks$/],
  ['GET',  /^\/api\/mixes$/, (url) => !!(url.searchParams.get('q') || '').trim()],   // text search only
  ['GET',  /^\/api\/channel$/],
  ['GET',  /^\/api\/playlist$/],
  ['POST', /^\/api\/automix$/],
  ['POST', /^\/api\/automix\/swap$/],
  ['POST', /^\/api\/resolve$/],
  ['POST', /^\/api\/track$/],
  ['POST', /^\/api\/playlist\/save$/],
  ['POST', /^\/api\/mixes\/share$/],
];

/** GET answers that are the same for everybody, and how long the edge keeps them (seconds). */
const CACHEABLE = [
  [/^\/api\/search$/, 60],
  [/^\/api\/tracks$/, 60],
  [/^\/api\/mixes$/, 60],
  [/^\/api\/mixes\/(\d+|[a-hj-km-np-z2-9]{8})$/, 60],
  [/^\/api\/config$/, 300],
];

const EXEMPT = /^\/api\/health$/;

/** The visitor a request is counted against: its address, an IPv6 one by its /64. '' if unknown. */
export function visitorKey(request) {
  const ip = (request.headers.get('CF-Connecting-IP') || '').trim();
  if (!ip) return '';
  if (!ip.includes(':')) return ip;
  return ipv6Prefix64(ip);
}

/** First four groups of an IPv6 address, '::' expanded. Anything unparseable is returned as given. */
export function ipv6Prefix64(ip) {
  const [head, tail] = ip.toLowerCase().split('::');
  const a = head ? head.split(':') : [];
  const b = tail !== undefined && tail !== '' ? tail.split(':') : [];
  if (tail === undefined && a.length !== 8) return ip;
  const groups = tail === undefined ? a : [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return ip;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

export function isHeavy(request, url) {
  return HEAVY.some(([m, re, test]) => request.method === m && re.test(url.pathname) && (!test || test(url)));
}

/** Seconds the edge may keep this GET, or 0 if it must not be cached. */
export function cacheSeconds(request, url) {
  if (request.method !== 'GET') return 0;
  if (request.headers.get('X-Riff-Key')) return 0;        // anything tied to a wallet is never shared
  for (const [re, secs] of CACHEABLE) if (re.test(url.pathname)) return secs;
  return 0;
}

async function under(binding, key) {
  if (!binding || typeof binding.limit !== 'function') return true;
  try {
    const { success } = await binding.limit({ key });
    return success !== false;
  } catch (err) {
    console.error('rate limiter failed (letting the request through): ' + (err && err.message));
    return true;
  }
}

/**
 * Check the visitor's limits. Returns null when the request may go on,
 * or { tier } when it is over a limit.
 */
export async function checkLimits(request, env, url) {
  if (!url.pathname.startsWith('/api/') || EXEMPT.test(url.pathname)) return null;
  const who = visitorKey(request);
  if (!who) return null;                                   // local dev / tests: no address
  if (!(await under(env.RL_API, who))) return { tier: 'api' };
  if (isHeavy(request, url) && !(await under(env.RL_HEAVY, who))) return { tier: 'heavy' };
  return null;
}

function edgeCache() {
  try { return typeof caches !== 'undefined' && caches.default ? caches.default : null; }
  catch { return null; }
}

function cacheKey(url) {
  return new Request(url.toString(), { method: 'GET' });
}

/** A kept answer for this GET, or null. */
export async function fromEdge(url) {
  const cache = edgeCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(cacheKey(url));
    if (!hit) return null;
    const res = new Response(hit.body, hit);
    res.headers.set('X-Riff-Edge', 'hit');
    res.headers.delete('Cache-Control');                   // the browser doesn't keep it; only the edge does
    return res;
  } catch { return null; }
}

/** Keep a clean 200 at the edge for `secs`. Returns the response to send (unchanged for the browser). */
export function toEdge(url, res, secs, ctx) {
  const cache = edgeCache();
  if (!cache || !secs || !res || res.status !== 200 || res.headers.get('X-Riff-Warning')) return res;
  try {
    const copy = new Response(res.clone().body, res);
    copy.headers.set('Cache-Control', `public, max-age=${secs}`);
    const p = cache.put(cacheKey(url), copy).catch(() => {});
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p);
  } catch { /* a cache that won't take it is not an error */ }
  return res;
}
