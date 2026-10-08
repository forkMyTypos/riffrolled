// ── the mood vocabulary, server side ─────────────────────────────────
//
// These 29 words are how a promoted track finds the brief it belongs in.
//
// They are not a new vocabulary. Every option in the DJ's own vocabulary
// (public/js/dj-data.js) is tagged from exactly this set — "Night drive"
// is night, motion, solo, dark, cinematic, hypnotic — and a brief's tags
// are the union of its picks' tags. So a promoter choosing from this list
// and a listener building a brief are describing music in the same words,
// which is the only reason tag overlap means anything. A promoter free to
// invent their own tags would match nothing, or match everything.
//
// The list is closed on purpose. An open vocabulary drifts into synonyms
// ("chill", "chilled", "relaxed") that split a match three ways, and it
// gives a promoter a text field pointing at the matching engine. Anything
// not in here is dropped rather than rejected, so a client that knows a
// newer tag than this deploy does degrades to its other tags.
//
// If the DJ vocabulary ever gains a tag, this list has to gain it too.
// That is checked mechanically, not remembered: the lint suite asserts
// every tag in dj-data.js appears here.

export const TAGS = [
  'bright', 'calm', 'cinematic', 'cold', 'dark', 'day', 'electronic',
  'euphoric', 'fast', 'focus', 'heavy', 'hypnotic', 'intense', 'light',
  'melancholy', 'modern', 'motion', 'night', 'organic', 'polished', 'raw',
  'retro', 'ritual', 'slow', 'social', 'solo', 'still', 'warm', 'weird',
];

const SET = new Set(TAGS);

/** How many tags one track may carry. Enough to describe it, few enough
 *  that tagging everything is not a winning strategy. */
export const MAX_TAGS = 8;

/**
 * Anything a client sends — array or comma string — to a clean, sorted,
 * deduped, capped list of known tags.
 *
 * Unknown words are dropped silently. That is the right failure here: a
 * promoter who typed something we do not know should see their other tags
 * work, not a form error about a word they cannot see the list for.
 */
export function parseTags(raw) {
  const parts = Array.isArray(raw) ? raw : String(raw || '').split(',');
  const out = [];
  for (const p of parts) {
    const t = String(p || '').trim().toLowerCase();
    if (SET.has(t) && !out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out.sort();
}

/**
 * How well a campaign's tags fit a brief's tags.
 *
 *     score = hits² / (how many tags the campaign claims)
 *
 * which is the number of shared tags multiplied by the fraction of the
 * campaign's claims that were met. Both halves are needed:
 *
 * The denominator stops "tag it with everything" from winning. A track
 * claiming eight moods and matching two is a worse fit than one claiming
 * two and matching two, even though both matched two — and without the
 * denominator they would rank the same, so the winning move would be to
 * claim every mood and the best-targeted campaign would lose to the
 * least honest one.
 *
 * Multiplying by the hits stops the opposite trick, which is subtler and
 * is what a test caught: with precision alone, a campaign tagged with a
 * single word scores a perfect 1.0 whenever that word appears, so the
 * way to the top of every brief is to claim exactly one common mood.
 * One hit out of one claim is precise but says very little; two out of
 * two says the same about precision and much more about fit.
 */
export function tagScore(campaignTags, briefTags) {
  if (!campaignTags.length || !briefTags.length) return 0;
  const brief = new Set(briefTags);
  let hits = 0;
  for (const t of campaignTags) if (brief.has(t)) hits++;
  return (hits * hits) / campaignTags.length;
}
