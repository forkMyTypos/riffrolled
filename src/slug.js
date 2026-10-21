// ── share codes for mixes ─────────────────────────────────────────────
// riffrolled.com/?m=<code>. Eight characters from a 31-letter alphabet with
// nothing that looks like something else (no 0/o, 1/l/i), about 8.5 × 10^11
// possibilities: far too many to guess, short enough to read out loud.
// Always at least one letter, so a code can never be mistaken for a row
// number (the API accepts both on the same path).

export const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const SLUG_RE = /^[a-hj-km-np-z2-9]{8}$/;

export function newMixSlug() {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    let s = '';
    for (const b of bytes) s += SLUG_ALPHABET[b % SLUG_ALPHABET.length];
    if (/[a-z]/.test(s)) return s;
  }
}
