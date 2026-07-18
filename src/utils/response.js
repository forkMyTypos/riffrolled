// ── HTTP response helpers ─────────────────────────────────────────────
// Every response goes through here so CORS and shape stay consistent.

/** CORS headers for the configured origin ("*" allowed for local dev). */
export function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/** JSON success response. `extraHeaders` lets routes attach metadata (e.g. cache source). */
export function json(env, data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(env),
      ...extraHeaders,
    },
  });
}

/** JSON error response with a stable shape the frontend can rely on. */
export function errorJson(env, message, status = 400, code = undefined) {
  return json(env, { error: message, ...(code ? { code } : {}) }, status);
}

/** Preflight handler. */
export function handleOptions(env) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

/** Read a JSON body defensively; returns null on absent/invalid JSON. */
export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** ISO timestamp used for all created_at/updated_at columns. */
export function nowIso() {
  return new Date().toISOString();
}
