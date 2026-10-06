// ── oEmbed: does this YouTube video actually exist? ───────────────────
//
// The catalogue is shared. Anyone can POST to /api/track and /api/playlist/save,
// and before this the only check was that the url *looked* like YouTube — so a
// loop could fill the catalogue with well-formed links to nothing, permanently,
// and nobody would notice until someone pressed play. Worse, the catalogue is
// what makes future lookups cheap, so poisoning it costs more than a day's
// YouTube quota does.
//
// YouTube's oEmbed endpoint settles it for free: no key, no API quota, 200 for
// a real video and 4xx for one that doesn't exist. It is the same check the
// browser already does at import time; doing it again here is the half that
// can't be skipped by not using the browser.
//
// THE CONSTRAINT THAT SHAPES THIS FILE: a Worker on the free plan may make
// **50 external subrequests per invocation**. A fifty-track playlist save
// would spend exactly that on verification alone and then fail on the next
// fetch. So this module never promises to check everything — it checks what
// it can afford, says what it checked, and leaves the caller to decide what
// to do about the rest. Three things keep the bill down:
//
//   1. the caller skips urls already in the catalogue (a D1 read is not an
//      external subrequest)
//   2. results are cached in the edge cache, so a popular track is verified
//      once for everybody rather than once per import
//   3. a hard per-request cap, below the free-plan ceiling, leaving room for
//      the rest of the request's own fetches

const OEMBED = 'https://www.youtube.com/oembed';

/* Overridable so the verification logic can be exercised against a stub that
   answers predictably — the real endpoint can't be made to return 404 on
   demand, which is exactly the branch most worth testing. Unset in
   production; setting it in wrangler.toml would point verification at
   somewhere other than YouTube, so it is deliberately not documented as a
   tunable. */
let endpoint = OEMBED;
export function _setEndpointForTests(url){ endpoint = url || OEMBED; }

/** Default live checks per request. Deliberately under the free plan's 50
 *  external subrequests, leaving headroom for everything else a route does. */
export const DEFAULT_MAX_CHECKS = 24;

/** How long a verdict stays in the edge cache. A video that exists today
 *  almost certainly exists tomorrow; one that doesn't may yet be published,
 *  so failures are cached for much less time than successes. */
const TTL_OK = 60 * 60 * 24 * 30;   // 30 days
const TTL_BAD = 60 * 60;            // 1 hour

/** Tunables, overridable in wrangler.toml [vars]. */
export function verifyConfig(env) {
  const n = Number(env.VERIFY_MAX_CHECKS);
  if (env.OEMBED_BASE) _setEndpointForTests(env.OEMBED_BASE);
  return {
    maxChecks: Number.isFinite(n) && n >= 0 ? n : DEFAULT_MAX_CHECKS,
    enabled: String(env.VERIFY_LINKS ?? '1') !== '0',
  };
}

/* A cache key has to be a URL on a domain we control; this one is never
   fetched, it just names the entry. */
const keyFor = (id) => new Request(`https://riffrolled.invalid/oembed/${id}`);

/**
 * Ask YouTube about one video id.
 * @returns {Promise<{ok: boolean, name?: string, artist?: string, status?: number}>}
 *          `ok:false` means YouTube says it isn't there. A network failure
 *          resolves to `{ok:true, unknown:true}` — see below.
 */
export async function verifyOne(id, { cache = true } = {}) {
  const cacheKey = keyFor(id);
  const store = caches.default;

  if (cache) {
    try {
      const hit = await store.match(cacheKey);
      if (hit) return { ...(await hit.json()), cached: true };
    } catch (e) { /* cache miss or unavailable — just ask */ }
  }

  let verdict;
  try {
    const url = `${endpoint}?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`;
    const res = await fetch(url, { cf: { cacheTtl: TTL_OK, cacheEverything: true } });
    if (res.ok) {
      const j = await res.json();
      verdict = { ok: true, name: String(j.title || ''), artist: String(j.author_name || '') };
    } else if (res.status === 404 || res.status === 400) {
      // The only two answers that mean "there is no such video": 404 for an
      // id YouTube doesn't know, 400 for one that isn't a video id at all.
      verdict = { ok: false, status: res.status };
    } else {
      /* Everything else is about us, not about the video: 401/403 from a
         proxy or a network policy, 429 for asking too often, 5xx when
         YouTube is having a bad day. This distinction is load-bearing —
         an earlier version counted 403 as a dead link, which meant a
         misbehaving middlebox would quietly delete everybody's tracks. A
         verdict we didn't really get is never evidence of anything. */
      return { ok: true, unknown: true, status: res.status };
    }
  } catch (e) {
    // A verification that could not run is NOT evidence of a dead link.
    // Failing open here is deliberate: the alternative is that a blip at
    // YouTube silently starts rejecting everybody's legitimate imports.
    // The row is still marked unverified, so nothing is taken on trust.
    return { ok: true, unknown: true, error: String(e && e.message) };
  }

  if (cache) {
    try {
      await store.put(cacheKey, new Response(JSON.stringify(verdict), {
        headers: {
          'content-type': 'application/json',
          'cache-control': `max-age=${verdict.ok ? TTL_OK : TTL_BAD}`,
        },
      }));
    } catch (e) { /* caching is an optimisation, never a requirement */ }
  }
  return verdict;
}

/**
 * Verify a list of ids, within budget.
 *
 * Returns a Map id → verdict for the ones actually checked. Ids beyond
 * `max` are simply absent from the Map: the caller must treat "not in the
 * map" as "not yet known", never as "fine".
 *
 * Requests go out in small waves rather than all at once — fifty parallel
 * fetches to one host is the shape of something being rate-limited.
 */
export async function verifyMany(ids, { max = DEFAULT_MAX_CHECKS, wave = 6 } = {}) {
  const out = new Map();
  const todo = [...new Set(ids)].slice(0, max);
  for (let i = 0; i < todo.length; i += wave) {
    const batch = todo.slice(i, i + wave);
    const verdicts = await Promise.all(batch.map((id) => verifyOne(id)));
    batch.forEach((id, n) => out.set(id, verdicts[n]));
  }
  return out;
}

/** The 11-character video id inside any YouTube url we accept, or ''. */
export function idFromUrl(url) {
  const m = /(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/.exec(String(url || ''));
  return m ? m[1] : '';
}
