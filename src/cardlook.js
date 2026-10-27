// ── how a promoted card looks ──────────────────────────────────────────
//
// An advertiser picks two things for a pop-up campaign: the STYLE of the
// card (a spinning record, or the gig-flyer poster) and a COLOR that tints
// it. Both are decoration only. Neither changes who sees the card, how
// often, or what it costs, and the "Promoted" disclosure sits outside
// anything the color touches, so it stays readable whatever was chosen.
//
// They are stored as small closed values, never as free text, because they
// end up in other people's pages:
//   style  'record' | 'poster'   (anything else is 'record')
//   color  '#rrggbb' | ''        ('' = the original look, no tint)
//   size   'sm' | 'md' | 'lg'    (how much of the record is picture; 'md' default)
//   hole   1 | 0                 (the spindle hole in the middle; 1 default)
// A color is only ever kept if it is exactly seven characters of that
// shape. The browser does the rest of the work (see promoPopup.paint).

import { GENRES } from './genres.js';

export const STYLES = ['record', 'poster'];
export const DEFAULT_STYLE = 'record';

export function cleanStyle(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return STYLES.includes(s) ? s : DEFAULT_STYLE;
}

/* Genre targeting (not decoration, but it lives with the rest of what an
   advertiser picks for the pop-up): up to three names from the closed
   genre list, matched without case, in the list's own spelling. Anything
   else is dropped. */
export const MAX_GENRES = 3;
export function cleanGenres(raw) {
  const parts = Array.isArray(raw) ? raw : String(raw == null ? '' : raw).split(',');
  const out = [];
  for (const p of parts) {
    const want = String(p == null ? '' : p).trim().toLowerCase();
    const hit = GENRES.find((g) => g.toLowerCase() === want);
    if (hit && !out.includes(hit)) out.push(hit);
    if (out.length >= MAX_GENRES) break;
  }
  return out;
}

/* How big the picture (the record's centre label) is. Closed list. */
export const SIZES = ['sm', 'md', 'lg'];
export const DEFAULT_SIZE = 'md';
export function cleanSize(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return SIZES.includes(s) ? s : DEFAULT_SIZE;
}

/* Whether the record has its spindle hole in the middle: 1 (yes, the
   default) or 0. The poster ignores it. */
export function cleanHole(v) {
  if (v === 0 || v === false) return 0;
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return (s === '0' || s === 'false' || s === 'no' || s === 'off') ? 0 : 1;
}

export function cleanColor(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(s) ? s : '';
}
