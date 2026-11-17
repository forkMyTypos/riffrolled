// ── one way to ask any model ─────────────────────────────────────────
//
// riffrolled's AI steps (the song picker, the Link Hunter) name a model as
// "provider:model", chosen in the admin tool and stored in D1 config, so
// models can be swapped and compared without a deploy:
//
//   workers:@cf/meta/llama-3.3-70b-instruct-fp8-fast   Cloudflare Workers AI (env.AI, no key)
//   anthropic:claude-haiku-5-5                          ANTHROPIC_API_KEY
//   openai:gpt-5-mini                                   OPENAI_API_KEY
//   gemini:gemini-3.6-flash                             GEMINI_API_KEY
//   openrouter:meta-llama/llama-3.3-70b-instruct        OPENROUTER_API_KEY (many models, one key)
//
// Keys are Worker secrets, set and removed from the admin tool's AI tab.
// They never touch D1 and never reach a browser.
//
// A chain — "anthropic:claude-haiku-5-5 | workers:@cf/meta/llama-3.3-70b-instruct-fp8-fast"
// — is tried left to right: a missing key, an error or an unreadable reply
// moves on to the next. ask() reports which one answered.
//
// webSearch: true lets the model search the web while it answers (the Link
// Hunter). Anthropic: the web_search server tool. OpenAI: the Responses
// API's web_search tool. Gemini: Google Search grounding. OpenRouter: the
// ":online" model suffix. Workers AI has no web search: skipped for it.

export const PROVIDERS = {
  workers:    { key: null,                 search: false },
  anthropic:  { key: 'ANTHROPIC_API_KEY',  search: true },
  openai:     { key: 'OPENAI_API_KEY',     search: true },
  gemini:     { key: 'GEMINI_API_KEY',     search: true },
  openrouter: { key: 'OPENROUTER_API_KEY', search: true },
};

/** "a:b | c:d" → [{ provider, model }], unknown providers dropped. */
export function parseChain(s) {
  return String(s || '').split(/[|\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const i = x.indexOf(':');
    return i < 0 ? null : { provider: x.slice(0, i).trim().toLowerCase(), model: x.slice(i + 1).trim() };
  }).filter((m) => m && PROVIDERS[m.provider] && m.model);
}

/** Can this model run here at all (key set, binding present, search if needed)? */
export function usable(env, m, webSearch = false) {
  const p = PROVIDERS[m.provider];
  if (!p) return false;
  if (webSearch && !p.search) return false;
  if (m.provider === 'workers') return !!(env.AI && typeof env.AI.run === 'function');
  return !!env[p.key];
}

/** The first {...} or [...] in a reply, parsed; null when there isn't one. */
export function parseJson(text) {
  if (text && typeof text === 'object') return text;
  const s = String(text || '').replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { /* try an array */ } }
  const c = s.indexOf('['), d = s.lastIndexOf(']');
  if (c >= 0 && d > c) { try { return { items: JSON.parse(s.slice(c, d + 1)) }; } catch (e) { /* none */ } }
  return null;
}

async function post(url, headers, body, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    const text = await res.text();
    let j = null; try { j = JSON.parse(text); } catch (e) { /* not json */ }
    if (!res.ok) {
      const msg = (j && (j.error?.message || j.error?.type || j.message)) || text.slice(0, 200);
      throw new Error(`HTTP ${res.status}: ${msg}`);
    }
    return j;
  } finally { clearTimeout(t); }
}

/* ── each provider: { text, searches, usage } ── */

async function runWorkers(env, m, o) {
  const r = await env.AI.run(m.model, {
    messages: [{ role: 'system', content: o.system }, { role: 'user', content: o.user }],
    max_tokens: o.maxTokens, temperature: o.temperature,
  });
  const text = typeof r === 'string' ? r
    : r && r.response !== undefined ? (typeof r.response === 'string' ? r.response : JSON.stringify(r.response))
    : r && r.choices && r.choices[0] && r.choices[0].message ? r.choices[0].message.content : '';
  return { text, searches: 0, usage: r && r.usage ? r.usage : null };
}

async function runAnthropic(env, m, o, cfg) {
  const body = {
    model: m.model, max_tokens: o.maxTokens, temperature: o.temperature,
    system: o.system, messages: [{ role: 'user', content: o.user }],
  };
  if (o.webSearch) body.tools = [{ type: cfg.AI_ANTHROPIC_SEARCH_TOOL || 'web_search_20250305', name: 'web_search', max_uses: o.maxSearches }];
  const headers = { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' };
  let j = await post('https://api.anthropic.com/v1/messages', headers, body, o.timeoutMs);
  let first = null;
  // a long search turn can pause; hand it back once to let it finish
  if (j && j.stop_reason === 'pause_turn') {
    first = j.usage || null;
    body.messages = [body.messages[0], { role: 'assistant', content: j.content }];
    j = await post('https://api.anthropic.com/v1/messages', headers, body, o.timeoutMs);
  }
  const blocks = (j && j.content) || [];
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const searches = (j && j.usage && j.usage.server_tool_use && j.usage.server_tool_use.web_search_requests)
    || blocks.filter((b) => b.type === 'server_tool_use').length;
  const usage = first && j && j.usage ? {
    input_tokens: (first.input_tokens || 0) + (j.usage.input_tokens || 0),
    output_tokens: (first.output_tokens || 0) + (j.usage.output_tokens || 0),
    cache_read_input_tokens: (first.cache_read_input_tokens || 0) + (j.usage.cache_read_input_tokens || 0),
  } : j && j.usage;
  return { text, searches: searches + (first && first.server_tool_use ? first.server_tool_use.web_search_requests || 0 : 0), usage };
}

async function runOpenAI(env, m, o) {
  const headers = { authorization: 'Bearer ' + env.OPENAI_API_KEY };
  // the Responses API serves both: plain answers and web search
  const body = {
    model: m.model, instructions: o.system, input: o.user, max_output_tokens: o.maxTokens,
  };
  if (o.webSearch) body.tools = [{ type: 'web_search' }];
  const j = await post('https://api.openai.com/v1/responses', headers, body, o.timeoutMs);
  let text = j && typeof j.output_text === 'string' ? j.output_text : '';
  let searches = 0;
  for (const item of (j && j.output) || []) {
    if (item.type === 'web_search_call') searches++;
    if (!text && item.type === 'message') for (const c of item.content || []) if (c.type === 'output_text') text += c.text;
  }
  return { text, searches, usage: j && j.usage };
}

async function runGemini(env, m, o) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m.model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: o.system }] },
    contents: [{ role: 'user', parts: [{ text: o.user }] }],
    generationConfig: { maxOutputTokens: o.maxTokens, temperature: o.temperature },
  };
  if (o.webSearch) body.tools = [{ google_search: {} }];
  const j = await post(url, { 'x-goog-api-key': env.GEMINI_API_KEY }, body, o.timeoutMs);
  const cand = j && j.candidates && j.candidates[0];
  const text = cand && cand.content ? (cand.content.parts || []).map((p) => p.text || '').join('') : '';
  const q = cand && cand.groundingMetadata && cand.groundingMetadata.webSearchQueries;
  return { text, searches: Array.isArray(q) ? q.length : 0, usage: j && j.usageMetadata };
}

async function runOpenRouter(env, m, o) {
  const model = o.webSearch && !/:online$/.test(m.model) ? m.model + ':online' : m.model;
  const j = await post('https://openrouter.ai/api/v1/chat/completions',
    { authorization: 'Bearer ' + env.OPENROUTER_API_KEY, 'x-title': 'riffrolled' },
    { model, max_tokens: o.maxTokens, temperature: o.temperature,
      messages: [{ role: 'system', content: o.system }, { role: 'user', content: o.user }] }, o.timeoutMs);
  const text = j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content || '' : '';
  return { text, searches: o.webSearch ? 1 : 0, usage: j && j.usage };
}

/** Every provider's usage as { tin, tout }: tokens in and out (thinking
 *  counts as out). The admin tool prices a run from these. */
export function tokens(u) {
  if (!u || typeof u !== 'object') return { tin: 0, tout: 0 };
  const n = (x) => Number(x) || 0;
  if (u.promptTokenCount !== undefined || u.candidatesTokenCount !== undefined) {   // Gemini
    return { tin: n(u.promptTokenCount) + n(u.toolUsePromptTokenCount), tout: n(u.candidatesTokenCount) + n(u.thoughtsTokenCount) };
  }
  return {
    tin: n(u.input_tokens) + n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens) + n(u.prompt_tokens),
    tout: n(u.output_tokens) + n(u.completion_tokens),
  };
}

const RUN = { workers: runWorkers, anthropic: runAnthropic, openai: runOpenAI, gemini: runGemini, openrouter: runOpenRouter };

/**
 * Ask the first usable model in `chain` and parse its JSON reply.
 * @returns {Promise<{ j, text, model, searches, ms, tried: [{model, error}] } | null>}
 */
export async function ask(env, cfg, chain, o) {
  const opts = {
    system: o.system, user: o.user,
    maxTokens: o.maxTokens || 2000, temperature: o.temperature ?? 0.7,
    webSearch: !!o.webSearch, maxSearches: o.maxSearches || 8,
    timeoutMs: o.timeoutMs || (o.webSearch ? 90000 : 45000),
  };
  const tried = [];
  for (const m of parseChain(chain)) {
    const name = m.provider + ':' + m.model;
    if (!usable(env, m, opts.webSearch)) { tried.push({ model: name, error: opts.webSearch && !PROVIDERS[m.provider].search ? 'no web search'
      : m.provider === 'workers' ? 'no Workers AI binding' : 'no ' + PROVIDERS[m.provider].key }); continue; }
    const t0 = Date.now();
    try {
      const r = await RUN[m.provider](env, m, opts, cfg || {});
      const j = parseJson(r.text);
      if (j && typeof j === 'object') return { j, text: r.text, model: name, searches: r.searches || 0, usage: r.usage, ...tokens(r.usage), ms: Date.now() - t0, tried };
      tried.push({ model: name, error: 'unreadable reply', ...tokens(r.usage), searches: r.searches || 0 });
    } catch (err) {
      tried.push({ model: name, error: String(err && err.message || err).slice(0, 200) });
      console.error('ai: ' + name + ' failed: ' + (err && err.message));
    }
  }
  return { j: null, model: '', tried, searches: 0, ms: 0 };
}
