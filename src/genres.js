// ── the genre vocabulary, server side ────────────────────────────────
//
// tracks.genre used to be whatever the AI said. So the catalogue held
// "synthwave", "Synth-wave", "synth pop" and "electronic" as four
// unrelated things, the Database filter matched one of them, and a
// promoter choosing "electronic" would have missed every track an AI had
// called "synthwave". It got worse the longer the site ran.
//
// This is the closed list. It is deliberately small, because it exists to
// be CHOSEN FROM — by a listener filtering the Database and, soon, by a
// promoter targeting a campaign — and a picker with a hundred entries is a
// search box. Thirty-one covers what an AI hands riffrolled in practice.
//
// It is also deliberately opinionated, and it is yours to edit: the names
// are what people see, and the RULES decide which of the AI's words land
// where. Nothing else needs to change when you add one.
//
// What happens to a word that matches nothing: genre is left blank and the
// original word is kept (the server in tracks.genre_raw, the browser as a
// tag). A blank genre is honest. A wrong one, or a new one-off entry in a
// "closed" list, is how the list drifts.
//
// The browser needs the same matcher at import time, with no network.
// public/js/genres.js is GENERATED from this file by the genres test,
// which fails if the two differ — so there is one list, in one place.

export const GENRES = [
  'Ambient', 'Electronic', 'House', 'Techno', 'Drum & Bass', 'Synthwave',
  'Downtempo', 'Lo-fi', 'Trip-hop', 'Hip-hop', 'R&B / Soul', 'Funk / Disco',
  'Jazz', 'Classical', 'Soundtrack', 'Folk', 'Country', 'Blues', 'Rock',
  'Indie', 'Alternative', 'Post-punk', 'Punk', 'Metal',
  'Shoegaze / Dream pop', 'Pop', 'Synth-pop', 'Reggae / Dub', 'Latin',
  'World', 'Experimental',
];

/* Matching is by whole words, so "house" does not match "warehouse", with
   one extension: a phrase of six or more letters also matches when the
   spaces are missing ("synthpop", "dreampop", "neoclassical"), because
   that is how people actually write them.

   ORDER IS THE POINT. The first rule that matches wins, so the specific
   comes before the general: "lo-fi hip hop" is Lo-fi because Lo-fi is
   asked before Hip-hop, "progressive house" is House because House is
   asked before Rock, "indie rock" is Indie because Indie is asked before
   Rock, and plain "pop" is the last resort. */
const RULES = [
  ['Synthwave',     ['synthwave', 'retrowave', 'outrun', 'vaporwave', 'chillwave', 'darksynth']],
  ['Synth-pop',     ['synth pop', 'synthpop', 'electropop', 'electro pop', 'new wave', 'dance pop']],
  ['Shoegaze / Dream pop', ['shoegaze', 'dream pop', 'dreampop', 'slowcore']],
  ['Post-punk',     ['post punk', 'postpunk', 'darkwave', 'coldwave', 'goth', 'gothic']],
  ['Trip-hop',      ['trip hop', 'triphop']],
  ['Lo-fi',         ['lo fi', 'lofi', 'chillhop', 'chill hop']],
  ['Drum & Bass',   ['drum and bass', 'drum n bass', 'drumandbass', 'dnb', 'jungle']],
  ['House',         ['house']],
  ['Techno',        ['techno', 'minimal', 'industrial']],
  ['Downtempo',     ['downtempo', 'chillout', 'chill out', 'lounge', 'chill']],
  ['Ambient',       ['ambient', 'drone', 'new age', 'soundscape']],
  ['Jazz',          ['jazz', 'bebop']],
  ['Hip-hop',       ['hip hop', 'hiphop', 'rap', 'trap', 'boom bap', 'grime', 'drill']],
  ['R&B / Soul',    ['r and b', 'rnb', 'r b', 'soul', 'motown', 'gospel']],
  ['Funk / Disco',  ['funk', 'disco', 'boogie']],
  ['Folk',          ['indie folk', 'folk', 'acoustic', 'singer songwriter']],
  ['Country',       ['country', 'americana', 'bluegrass', 'honky tonk']],
  ['Blues',         ['blues']],
  ['Metal',         ['metal', 'metalcore', 'deathcore', 'doom', 'sludge', 'thrash']],
  ['Punk',          ['pop punk', 'punk', 'hardcore', 'emo']],
  // before Reggae: "reggaeton" contains "reggae", and is not it
  ['Latin',         ['latin', 'bossa nova', 'salsa', 'cumbia', 'reggaeton', 'samba', 'tango', 'flamenco']],
  ['Reggae / Dub',  ['reggae', 'dub', 'ska', 'dancehall']],
  ['Indie',         ['indie']],
  ['Alternative',   ['alternative', 'alt rock', 'alt', 'grunge']],
  ['Rock',          ['rock', 'psychedelic', 'psych', 'prog', 'krautrock', 'surf']],
  ['World',         ['world', 'afrobeat', 'afrobeats', 'african', 'celtic', 'balkan', 'klezmer', 'bollywood', 'indian', 'arabic', 'gamelan', 'fado', 'qawwali', 'highlife', 'soukous']],
  ['Soundtrack',    ['soundtrack', 'score', 'ost', 'film', 'video game', 'cinematic']],
  ['Classical',     ['classical', 'neoclassical', 'orchestral', 'baroque', 'opera', 'symphony', 'piano']],
  ['Experimental',  ['experimental', 'idm', 'glitch', 'noise', 'avant garde', 'musique concrete']],
  ['Electronic',    ['electronic', 'electronica', 'edm', 'electro', 'trance', 'dubstep', 'dance']],
  ['Pop',           ['pop']],
];

function words(raw) {
  return String(raw == null ? '' : raw)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Whatever an AI (or a person) called a genre → the closed list.
 *
 *     normalizeGenre('Synth-wave')   → { genre: 'Synthwave', raw: 'Synth-wave' }
 *     normalizeGenre('sparkle core') → { genre: '',          raw: 'sparkle core' }
 *
 * `raw` is always the original, trimmed, so a caller can keep it. An
 * unrecognised word gives genre '' rather than a guess.
 */
export function normalizeGenre(input) {
  const raw = String(input == null ? '' : input).trim().slice(0, 100);
  const s = words(raw);
  if (!s) return { genre: '', raw };
  const padded = ' ' + s + ' ';
  const squashed = s.replace(/ /g, '');
  for (const [genre, phrases] of RULES) {
    for (const p of phrases) {
      if (padded.includes(' ' + p + ' ')) return { genre, raw };
      const q = p.replace(/ /g, '');
      if (q.length >= 6 && squashed.includes(q)) return { genre, raw };
    }
  }
  // already one of ours, spelled the way we spell it
  const exact = GENRES.find((g) => g.toLowerCase() === raw.toLowerCase());
  return { genre: exact || '', raw };
}
