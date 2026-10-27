// ── how the site is used: daily totals, nothing else ──────────────────
//
// The browser sends, with its regular /api/stats summary, a tally such as
//   { events: { visit: 1, 'panel:mixes': 2, dj_copy: 1 } }
// and the server adds each number to that day's total for that event.
//
// What is kept: (day, event, count). What is not: who, which device, which
// address, when in the day, in what order, or anything about a track or a
// playlist. Two people opening Mixes and one person opening it twice look
// exactly the same, which is the point.
//
// The list of events is closed: anything not on it is dropped, so a client
// cannot turn this table into a store for arbitrary text. A listener can
// switch counting off (Privacy → "Count how I use riffrolled"), and a
// browser that sends Global Privacy Control starts with it off.

export const EVENTS = new Set([
  // visits: once per browser tab session
  'visit', 'visit_new', 'visit_phone', 'visit_computer',
  // panels opened
  'panel:dj-ai', 'panel:playlist', 'panel:mixes', 'panel:search', 'panel:import', 'panel:database',
  'panel:random-mix', 'panel:history', 'panel:track-info', 'panel:mine', 'panel:promote',
  'panel:your-promotions', 'panel:about-legal',
  // listening
  'play', 'like', 'dislike',
  // DJ AI
  'dj_copy', 'dj_import',
  // playlists
  'playlist_new', 'playlist_from_selection', 'playlist_window',
  // sharing
  'share_track', 'share_link', 'share_community', 'mix_open',
  // search
  'search_catalogue', 'search_youtube',
  // credits and promotion
  'mine_block', 'promote_start', 'promo_shown', 'promo_play', 'promo_add', 'promo_close', 'promo_report',
]);

const MAX_PER_EVENT = 500;     // in one summary from one browser
const MAX_EVENTS = 60;

/** `{ name: count }` → a clean Map of known events with sane counts. */
export function cleanEvents(obj) {
  const out = new Map();
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [name, raw] of Object.entries(obj)) {
    if (out.size >= MAX_EVENTS) break;
    if (!EVENTS.has(name)) continue;
    const n = Math.floor(Number(raw));
    if (!(n > 0)) continue;
    out.set(name, Math.min(n, MAX_PER_EVENT));
  }
  return out;
}

/** D1 statements adding these to today's totals (UTC day). */
export function usageStatements(db, events, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const s = db.prepare(
    `INSERT INTO usage (day, event, n) VALUES (?1, ?2, ?3)
       ON CONFLICT(day, event) DO UPDATE SET n = n + excluded.n`
  );
  return [...events].map(([name, n]) => s.bind(day, name, n));
}
