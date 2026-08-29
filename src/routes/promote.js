// ── promotions: spend riff tokens to feature a catalogue track ────────
//   POST /api/promote     { wallet, url } → { ok, balance, expires_at }
//   GET  /api/promotions                  → [ { url, name, expires_at } ]
//
// Only tracks already in the shared catalogue can be promoted, so the
// promoted strip can never carry arbitrary content — same safety story
// as the rest of the site.

import { json, errorJson, readJson, nowIso } from '../utils/response.js';
import {
  WALLET_RE, canonicalYouTubeUrl, getTrackByUrl,
  walletBalance, addLedger, addPromotion, activePromotions, ensureWallet,
  bumpPromotion, walletPromotions, getOwnedPromotion,
  pausePromotion, resumePromotion, extendPromotion,
} from '../db/queries.js';
import { mineConfig } from './mine.js';

export async function handlePromote(request, env) {
  const body = await readJson(request);
  const wallet = String(body?.wallet || '');
  if (!WALLET_RE.test(wallet)) return errorJson(env, 'Invalid wallet', 400);

  const canonical = canonicalYouTubeUrl(String(body?.url || ''));
  if (!canonical) return errorJson(env, 'url must be a YouTube video link or id', 400);

  const track = await getTrackByUrl(env.DB, canonical);
  if (!track) return errorJson(env, 'That track is not in the catalogue yet', 404);

  const cfg = mineConfig(env);

  // spend is the promoter's choice: the base cost buys the base run, and
  // every extra token buys proportionally more time (and a higher slot).
  const asked = Math.floor(Number(body?.tokens) || cfg.promoteCost);
  if (!Number.isFinite(asked) || asked < cfg.promoteCost) {
    return errorJson(env, `Minimum spend is ${cfg.promoteCost} tokens`, 400);
  }
  const spend = Math.min(asked, cfg.promoteCost * 40);   // sane ceiling

  const now = nowIso();
  await ensureWallet(env.DB, wallet, now);
  const balance = await walletBalance(env.DB, wallet);
  if (balance < spend) {
    return errorJson(env, `Not enough riff tokens (need ${spend}, have ${balance})`, 402, 'poor');
  }

  const hours = cfg.promoteHours * (spend / cfg.promoteCost);
  const expires = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  await addLedger(env.DB, wallet, -spend, 'promote', canonical, now);
  await addPromotion(env.DB, wallet, canonical, track.name, now, expires, spend);

  return json(env, {
    ok: true, spent: spend, hours,
    balance: balance - spend, expires_at: expires,
  });
}

export async function handlePromotions(request, env) {
  const list = await activePromotions(env.DB, nowIso(), 20);
  return json(env, list);
}

/**
 * POST /api/promo/event  { url, kind: 'play' | 'like' }
 * Anonymous engagement ping for a promoted track. Deliberately takes no
 * wallet and stores no identifier — it only nudges a counter on the
 * promotion row, so a promoter sees totals and never sees people.
 * Counters are best-effort: with no auth they can be inflated, so they're
 * presented as approximate rather than as audited analytics.
 */
export async function handlePromoEvent(request, env) {
  const body = await readJson(request);
  const canonical = canonicalYouTubeUrl(String(body?.url || ''));
  const kind = body?.kind === 'like' ? 'like' : 'play';
  if (!canonical) return errorJson(env, 'url must be a YouTube video link or id', 400);

  const changed = await bumpPromotion(env.DB, canonical, kind, nowIso());
  return json(env, { ok: true, counted: changed > 0 });
}

/** GET /api/promotions/mine?wallet=… — the caller's own promotions + stats. */
export async function handleMyPromotions(request, env, url) {
  const wallet = String(url.searchParams.get('wallet') || '');
  if (!WALLET_RE.test(wallet)) return errorJson(env, 'Invalid wallet', 400);
  const list = await walletPromotions(env.DB, wallet, nowIso(), 25);
  return json(env, list);
}

/**
 * POST /api/promotion/action  { wallet, id, action: 'pause'|'resume'|'extend', tokens? }
 * Owner controls. Pausing banks the remaining time rather than burning it,
 * so a promoter can hold their spend for a better moment; resuming spends
 * it forward from now. Extending buys more time (and a better slot) at the
 * same rate as the original purchase.
 */
export async function handlePromotionAction(request, env) {
  const body = await readJson(request);
  const wallet = String(body?.wallet || '');
  const id = Number(body?.id);
  const action = String(body?.action || '');
  if (!WALLET_RE.test(wallet)) return errorJson(env, 'Invalid wallet', 400);
  if (!Number.isInteger(id) || id <= 0) return errorJson(env, 'Invalid promotion id', 400);

  const promo = await getOwnedPromotion(env.DB, id, wallet);
  if (!promo) return errorJson(env, 'Promotion not found', 404);

  const cfg = mineConfig(env);
  const now = Date.now();

  if (action === 'pause') {
    if (promo.paused) return errorJson(env, 'Already paused', 400);
    const remaining = new Date(promo.expires_at).getTime() - now;
    if (!(remaining > 0)) return errorJson(env, 'That promotion has already ended', 400);
    await pausePromotion(env.DB, id, Math.floor(remaining));
    return json(env, { ok: true, paused: true, remaining_ms: Math.floor(remaining) });
  }

  if (action === 'resume') {
    if (!promo.paused) return errorJson(env, 'Not paused', 400);
    const remaining = Math.max(0, promo.remaining_ms || 0);
    if (!remaining) return errorJson(env, 'No time left on that promotion', 400);
    const expires = new Date(now + remaining).toISOString();
    await resumePromotion(env.DB, id, expires);
    return json(env, { ok: true, paused: false, expires_at: expires });
  }

  if (action === 'extend') {
    const add = Math.floor(Number(body?.tokens) || 0);
    if (!(add > 0)) return errorJson(env, 'Tokens to add must be a positive number', 400);
    if (add > cfg.promoteCost * 40) return errorJson(env, 'That is more than the per-top-up limit', 400);

    const balance = await walletBalance(env.DB, wallet);
    if (balance < add) {
      return errorJson(env, `Not enough riff tokens (need ${add}, have ${balance})`, 402, 'poor');
    }

    // extra hours are added to whatever is left (or to the banked time if paused)
    const addHours = cfg.promoteHours * (add / cfg.promoteCost);
    const addMs = addHours * 3600 * 1000;
    await addLedger(env.DB, wallet, -add, 'promote_extend', String(promo.url), new Date(now).toISOString());

    if (promo.paused) {
      await pausePromotion(env.DB, id, Math.floor((promo.remaining_ms || 0) + addMs));
      await extendPromotion(env.DB, id, add, promo.expires_at);
    } else {
      const base = Math.max(now, new Date(promo.expires_at).getTime());
      await extendPromotion(env.DB, id, add, new Date(base + addMs).toISOString());
    }
    return json(env, { ok: true, added: add, balance: balance - add, added_hours: addHours });
  }

  return errorJson(env, "action must be 'pause', 'resume' or 'extend'", 400);
}
