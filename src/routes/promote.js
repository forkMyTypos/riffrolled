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
  const now = nowIso();
  await ensureWallet(env.DB, wallet, now);
  const balance = await walletBalance(env.DB, wallet);
  if (balance < cfg.promoteCost) {
    return errorJson(env, `Not enough riff tokens (need ${cfg.promoteCost}, have ${balance})`, 402, 'poor');
  }

  const expires = new Date(Date.now() + cfg.promoteHours * 3600 * 1000).toISOString();
  await addLedger(env.DB, wallet, -cfg.promoteCost, 'promote', canonical, now);
  await addPromotion(env.DB, wallet, canonical, track.name, now, expires);

  return json(env, { ok: true, balance: balance - cfg.promoteCost, expires_at: expires });
}

export async function handlePromotions(request, env) {
  const list = await activePromotions(env.DB, nowIso(), 20);
  return json(env, list);
}
