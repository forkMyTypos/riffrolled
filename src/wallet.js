// ── wallet keys: a private key you keep, a public key the server keeps ──
//
// A wallet used to be one secret: 64 random hex characters that lived in the
// browser AND were stored on the server as the wallet's id. Anyone who could
// read the database (or a log line with ?wallet= in it) could spend from it.
//
// Now there are two keys:
//
//   private key  64 random hex characters, made in the browser and kept there.
//                It is what you copy to use your wallet on another device.
//                It is sent to the server over HTTPS to prove who you are, and
//                never stored: the server hashes it and throws it away.
//   public key   sha256("riffrolled/wallet/v1:" + private key), 64 hex. This is
//                the wallet's id everywhere — ledger, promotions, the admin
//                tool. Safe to show and to share; it cannot be turned back
//                into the private key.
//
// It is deliberately simple — a hash, not a signature scheme — because the
// private key already travels only over HTTPS to riffrolled itself. A
// signature (the browser signing a challenge) can replace the hash later
// without changing what either key means to the listener.
//
// EXISTING WALLETS were stored under their private key. They move across by
// themselves the first time their owner shows up with the key: every row
// filed under the old id is re-filed under the public key. Only rows marked
// legacy (wallets.pub = 0, schema 21) can be adopted that way — so sending
// somebody's PUBLIC key as if it were a private key cannot pull their wallet
// across to a key you hold.

export const KEY_RE = /^[0-9a-f]{64}$/;
const PREFIX = 'riffrolled/wallet/v1:';

export async function publicKeyOf(priv) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(PREFIX + priv));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The private key on a request: the X-Riff-Key header (preferred — it keeps
 *  the key out of URLs and logs), else the body's `wallet`, else ?wallet=. */
export function privateKeyFrom(request, body, url) {
  const h = request && request.headers && request.headers.get('X-Riff-Key');
  const raw = h || (body && body.wallet) || (url && url.searchParams && url.searchParams.get('wallet')) || '';
  return String(raw).trim().toLowerCase();
}

const adopted = new Set();   // per isolate: a wallet already checked needs no second look

/** The caller's PUBLIC key, or null if no valid private key came with the request. */
export async function walletFrom(env, request, body, url) {
  const priv = privateKeyFrom(request, body, url);
  if (!KEY_RE.test(priv)) return null;
  const pub = await publicKeyOf(priv);
  if (!adopted.has(pub)) {
    await adoptLegacy(env.DB, priv, pub);
    adopted.add(pub);
  }
  return pub;
}

/** Move a pre-schema-21 wallet, filed under its private key, onto its public key. */
export async function adoptLegacy(db, priv, pub) {
  let legacy;
  try {
    legacy = await db.prepare(`SELECT id FROM wallets WHERE id = ?1 AND pub = 0`).bind(priv).first();
  } catch (e) {
    return false;            // schema 21 not applied yet: nothing to adopt
  }
  if (!legacy) return false;
  const already = await db.prepare(`SELECT id FROM wallets WHERE id = ?1`).bind(pub).first();
  await db.batch([
    already
      ? db.prepare(`DELETE FROM wallets WHERE id = ?1 AND pub = 0`).bind(priv)
      : db.prepare(`UPDATE wallets SET id = ?2, pub = 1 WHERE id = ?1 AND pub = 0`).bind(priv, pub),
    db.prepare(`UPDATE ledger SET wallet_id = ?2 WHERE wallet_id = ?1`).bind(priv, pub),
    db.prepare(`UPDATE mint_challenges SET wallet_id = ?2 WHERE wallet_id = ?1`).bind(priv, pub),
    db.prepare(`UPDATE promotions SET wallet_id = ?2 WHERE wallet_id = ?1`).bind(priv, pub),
    db.prepare(`UPDATE OR IGNORE contrib SET wallet_id = ?2 WHERE wallet_id = ?1`).bind(priv, pub),
    db.prepare(`UPDATE links SET created_by = ?2 WHERE created_by = ?1`).bind(priv, pub),
  ]);
  return true;
}
