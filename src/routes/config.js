// ── Config route ──────────────────────────────────────────────────────
//   GET /api/config   the handful of numbers the browser needs
//
// There is deliberately NO admin write endpoint here. The admin tool's own
// README states that riffrolled.com has no admin pages or admin API at all,
// and that is a real security property worth keeping: the public Worker
// exposes nothing that can retune the economy, so there is no privileged
// endpoint to find, no admin secret to leak, and no route to rate-limit.
//
// The admin tool doesn't need one. It already holds a Cloudflare API token
// with `D1 Edit` and already runs read-only SQL, so it writes the `config`
// table directly through Cloudflare's own API — authenticated by Cloudflare,
// audited by Cloudflare, and never passing through riffrolled.com.
//
// That leaves validation outside the Worker, which would be a worry if the
// read path trusted what it found. It doesn't: src/config.js re-checks every
// stored value against its range and falls through to the default when it
// doesn't fit. So a bad row — however it was written — cannot take effect.

import { json } from '../utils/response.js';
import { getConfig, PUBLIC_KEYS } from '../config.js';
import { TAGS, MAX_TAGS } from '../tags.js';

/** The browser's view: the few settings the UI genuinely has to know. */
export async function handlePublicConfig(request, env) {
  const cfg = await getConfig(env);
  const out = {};
  for (const k of PUBLIC_KEYS) out[k] = cfg[k];

  /* The mood vocabulary comes down with the config rather than being
     copied into the Promote panel. The Promote panel has to offer exactly
     the words the server will accept, and the DJ's options are tagged
     from the same list — three hand-maintained copies of 29 words is
     three chances for one to drift and for matching to quietly stop
     working. One source, shipped. */
  out.TAGS = TAGS;
  out.MAX_TAGS = MAX_TAGS;

  return json(env, out, 200, { 'Cache-Control': 'public, max-age=30' });
}
