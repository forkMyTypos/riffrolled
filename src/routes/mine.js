// ── riff token mining (hashcash, RPOW-spirit) ─────────────────────────
//   POST /api/mine/challenge { wallet }            → { challenge, difficulty_bits, reward }
//   POST /api/mine/submit    { wallet, challenge, nonce } → { ok, reward, balance }
//   GET  /api/wallet?wallet=…                      → { balance, mined_today, daily_cap, promote_cost }
//
// The client grinds SHA-256(challenge + ':' + nonce) until it has enough
// leading zero bits; the Worker verifies in one hash. Challenges are
// single-use and expire, so a found nonce can't be replayed. Minting only
// ever happens here — the ledger stays honest for any future phase.

import { json, errorJson, readJson, nowIso } from '../utils/response.js';
import {
  WALLET_RE, ensureWallet, walletBalance, countMinedToday,
  addLedger, createChallenge, getChallenge, useChallenge,
} from '../db/queries.js';

/** Tunables (override in wrangler.toml [vars]). */
export function mineConfig(env) {
  return {
    difficulty: Math.min(Math.max(Number(env.MINE_DIFFICULTY_BITS) || 20, 8), 30),
    reward: Math.max(Number(env.MINE_REWARD) || 1, 1),
    dailyCap: Math.max(Number(env.MINE_DAILY_CAP) || 50, 1),
    promoteCost: Math.max(Number(env.PROMOTE_COST) || 5, 1),
    promoteHours: Math.max(Number(env.PROMOTE_HOURS) || 24, 1),
  };
}

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Count leading zero bits of a byte array. */
function leadingZeroBits(bytes) {
  let bits = 0;
  for (const b of bytes) {
    if (b === 0) { bits += 8; continue; }
    let v = b;
    while ((v & 0x80) === 0) { bits++; v <<= 1; }
    break;
  }
  return bits;
}

export async function handleMineChallenge(request, env) {
  const body = await readJson(request);
  const wallet = String(body?.wallet || '');
  if (!WALLET_RE.test(wallet)) return errorJson(env, 'Invalid wallet', 400);

  const cfg = mineConfig(env);
  const now = nowIso();
  await ensureWallet(env.DB, wallet, now);

  const minedToday = await countMinedToday(env.DB, wallet, now.slice(0, 10));
  if (minedToday >= cfg.dailyCap) {
    return errorJson(env, `Daily mining cap reached (${cfg.dailyCap})`, 429, 'cap');
  }

  const challenge = randomHex(16);
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes to solve
  await createChallenge(env.DB, challenge, wallet, cfg.difficulty, now, expires);
  return json(env, { challenge, difficulty_bits: cfg.difficulty, reward: cfg.reward });
}

export async function handleMineSubmit(request, env) {
  const body = await readJson(request);
  const wallet = String(body?.wallet || '');
  const challenge = String(body?.challenge || '');
  const nonce = String(body?.nonce || '');
  if (!WALLET_RE.test(wallet)) return errorJson(env, 'Invalid wallet', 400);
  if (!/^[0-9a-f]{32}$/.test(challenge) || nonce.length === 0 || nonce.length > 64) {
    return errorJson(env, 'Invalid challenge or nonce', 400);
  }

  const row = await getChallenge(env.DB, challenge);
  if (!row || row.wallet_id !== wallet) return errorJson(env, 'Unknown challenge', 404);
  if (row.expires_at <= nowIso()) return errorJson(env, 'Challenge expired — request a new one', 410);

  // one SHA-256 verifies the client's work
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${challenge}:${nonce}`))
  );
  if (leadingZeroBits(digest) < row.difficulty) {
    return errorJson(env, 'Proof of work does not meet the difficulty', 400);
  }

  // single-use: only the first valid submit mints
  if (!(await useChallenge(env.DB, challenge))) {
    return errorJson(env, 'Challenge already redeemed', 409);
  }

  const cfg = mineConfig(env);
  await addLedger(env.DB, wallet, cfg.reward, 'mine', challenge, nowIso());
  const balance = await walletBalance(env.DB, wallet);
  return json(env, { ok: true, reward: cfg.reward, balance });
}

export async function handleWallet(request, env, url) {
  const wallet = String(url.searchParams.get('wallet') || '');
  if (!WALLET_RE.test(wallet)) return errorJson(env, 'Invalid wallet', 400);
  const cfg = mineConfig(env);
  const now = nowIso();
  await ensureWallet(env.DB, wallet, now);
  const balance = await walletBalance(env.DB, wallet);
  const minedToday = await countMinedToday(env.DB, wallet, now.slice(0, 10));
  return json(env, {
    balance,
    mined_today: minedToday,
    daily_cap: cfg.dailyCap,
    promote_cost: cfg.promoteCost,
    difficulty_bits: cfg.difficulty,
  });
}
