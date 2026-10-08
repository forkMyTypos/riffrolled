/* riffrolled — dj-data.js
   The DJ AI vocabulary: the categories the menu is built from, the options
   in each, and the tags that quietly relate them.

   ── How the linking works ───────────────────────────────────────────────
   Every option carries a few tags. Two options are "related" when they
   share tags — that is the whole mechanism. There is no rules engine and
   no compatibility table, because linked must never mean constrained.

   Riff Roll uses the overlap to *weight* the dice, not to filter them:
   an option with nothing in common with what's already picked still has a
   real chance of coming up. Chaos Mode deliberately goes the other way.

   So "Funeral + Euphoric + Death Metal + 90% familiar" is reachable by an
   ordinary roll and likely under chaos — exactly as intended.

   Everything here is seed data. It is copied into Dexie on first run and
   the user owns it after that: they can add options, add whole categories,
   favourite things and hide what they never pick. Tags are editable too,
   so a custom option joins the vocabulary the moment it's typed. */

/* The shared tag vocabulary. Not enforced — an option can carry any word —
   but keeping to these makes the relationships mean something. */
var DJ_TAGS = [
  'dark', 'bright', 'night', 'day', 'motion', 'still', 'social', 'solo',
  'intense', 'calm', 'weird', 'warm', 'cold', 'euphoric', 'melancholy',
  'electronic', 'organic', 'heavy', 'light', 'fast', 'slow', 'retro',
  'modern', 'cinematic', 'hypnotic', 'raw', 'polished', 'ritual', 'focus'
];

/* Every category needs a way of saying "you choose". These are ordinary
   options with one difference: the dice never land on them, because a roll
   that rolls "don't mind" has wasted your throw. They are the Speed mode
   defaults, so a brand-new listener can press one button and go. */
var DJ_ANY = {
  activity:    { label: 'Nothing special', line: 'Nothing in particular — your call.' },
  feel:        { label: 'Don\'t mind',     line: 'No strong feeling — you decide the mood.' },
  direction:   { label: 'Don\'t mind',     line: 'No direction set — take me wherever you think is good.' },
  personality: { label: 'Don\'t mind',     line: 'Be whatever DJ this set needs.' }
};

/* How long the DJ is likely to take, in seconds. A guess, and said as one:
   a model that browses YouTube for every track is far slower than one
   answering from memory. Tune here. */
var DJ_TIME = {
  speedPerTrack: 4,      // speed mode: pick and move on
  detailsPerTrack: 10,   // details mode: a reason per track, more care
  extraCategory: 10,     // every extra thing the brief asks it to weigh
  shareContext: 15,      // reading what you already listen to
  chaosMultiplier: 1.25, // making an awkward combination work takes longer
  minimum: 30
};

var DJ_CATEGORIES = [

  {
    key: 'activity',
    label: 'What are you doing?',
    icon: '🚗',
    order: 10,
    enabled: true,
    placeholder: 'Pick what you\'re up to…',
    options: [
      { label: 'Night drive',          tags: ['night','motion','solo','dark','cinematic','hypnotic'] },
      { label: 'Working',              tags: ['focus','calm','still','hypnotic','day'] },
      { label: 'Walking',              tags: ['motion','day','solo','light'] },
      { label: 'Cooking',              tags: ['warm','social','day','bright'] },
      { label: 'Gaming',               tags: ['intense','focus','electronic','night'] },
      { label: 'Party',                tags: ['social','euphoric','fast','night','bright'] },
      { label: 'Chilling',             tags: ['calm','still','warm','light'] },
      { label: 'Late-night drinking',  tags: ['night','social','melancholy','warm','raw'] },
      { label: 'Road trip',            tags: ['motion','day','bright','social'] },
      { label: 'Exercise',             tags: ['fast','intense','motion','bright'] },
      { label: 'Reading',              tags: ['calm','still','focus','light'] },
      { label: 'Cleaning',             tags: ['motion','bright','fast','day'] },
      { label: 'Funeral',              tags: ['ritual','melancholy','still','dark','solo'] },
      { label: 'Getting ready',        tags: ['bright','euphoric','fast','social','night'] },
      { label: 'Fucking about',        tags: ['weird','light','social','raw'] }
    ]
  },

  {
    key: 'feel',
    label: 'How do you want it to feel?',
    icon: '🌡',
    order: 20,
    enabled: true,
    placeholder: 'Pick a feeling…',
    options: [
      { label: 'Dark',          tags: ['dark','night','cold','heavy'] },
      { label: 'Euphoric',      tags: ['euphoric','bright','fast','social'] },
      { label: 'Relaxed',       tags: ['calm','warm','still','light'] },
      { label: 'Energetic',     tags: ['fast','intense','bright','motion'] },
      { label: 'Melancholic',   tags: ['melancholy','dark','slow','solo'] },
      { label: 'Cinematic',     tags: ['cinematic','slow','dark','polished'] },
      { label: 'Dreamy',        tags: ['hypnotic','light','slow','warm'] },
      { label: 'Aggressive',    tags: ['heavy','intense','fast','raw'] },
      { label: 'Mysterious',    tags: ['dark','weird','hypnotic','cold'] },
      { label: 'Warm',          tags: ['warm','organic','light','social'] },
      { label: 'Weird',         tags: ['weird','raw','hypnotic'] },
      { label: 'Beautiful',     tags: ['light','polished','warm','slow'] },
      { label: 'Tense',         tags: ['intense','cold','dark','cinematic'] },
      { label: 'Uplifting',     tags: ['bright','euphoric','warm','fast'] }
    ]
  },

  {
    key: 'direction',
    label: 'Where should we go?',
    icon: '🧭',
    order: 30,
    enabled: true,
    placeholder: 'Pick a starting coordinate…',
    // a direction is a starting point, not a filter — the prompt says so
    note: 'A starting coordinate, not a genre filter. The DJ is allowed to wander.',
    options: [
      { label: 'Electronic',                   tags: ['electronic','hypnotic','night','modern'] },
      { label: 'Rock',                         tags: ['organic','raw','motion','retro'] },
      { label: 'Metal',                        tags: ['heavy','intense','dark','raw'] },
      { label: 'Funk',                         tags: ['organic','social','warm','retro','motion'] },
      { label: 'Jazz',                         tags: ['organic','warm','night','solo','raw'] },
      { label: 'Hip-hop',                      tags: ['modern','raw','social','night'] },
      { label: 'Ambient',                      tags: ['calm','still','hypnotic','cold','electronic'] },
      { label: 'Experimental',                 tags: ['weird','raw','cold','modern'] },
      { label: 'World',                        tags: ['organic','warm','bright','ritual'] },
      { label: 'Indie',                        tags: ['organic','light','melancholy','modern'] },
      { label: 'Something completely different',tags: ['weird','modern','raw'] }
    ]
  },

  {
    key: 'discovery',
    label: 'Discovery',
    icon: '🔦',
    order: 40,
    enabled: true,
    placeholder: 'How adventurous?',
    note: 'A signal, not a rule. "Find artists I probably haven\'t heard", never "find tracks under X views".',
    options: [
      { label: 'Take me somewhere new',   tags: ['weird','modern'],
        line: 'Take me somewhere new. Artists and corners I would not have found on my own.' },
      { label: 'Under-discovered artists',tags: ['raw','organic'],
        line: 'Favour under-discovered artists — people doing real work without much of an audience.' },
      { label: 'Deep cuts',               tags: ['raw','retro','solo'],
        line: 'Deep cuts: album tracks and overlooked songs rather than the obvious singles.' },
      { label: 'Emerging artists',        tags: ['modern','bright'],
        line: 'Lean towards emerging artists — recent, still building, worth hearing early.' },
      { label: 'Rabbit hole',             tags: ['hypnotic','weird','night'],
        line: 'Take me down a rabbit hole: let each track pull the next one further in.' },
      { label: 'Surprise me',             tags: ['weird'],
        line: 'Surprise me. You choose how far to push it.' },
      { label: 'Don\'t care',             tags: [],
        line: 'No particular discovery brief — just make it good.' }
    ]
  },

  {
    key: 'personality',
    label: 'DJ personality',
    icon: '🎭',
    order: 50,
    enabled: true,
    placeholder: 'Who\'s behind the decks?',
    note: 'Personality shapes how the DJ presents the journey — never which music is allowed.',
    // `line` is the voice handed to the AI; tags are deliberately light so a
    // personality nudges the roll without becoming a genre filter
    options: [
      { label: 'Wrong Turn Radio',        tags: ['weird','motion'],
        line: 'You are Wrong Turn Radio: every choice feels like a wrong turn that turned out better than the route.' },
      { label: 'The Rabbit Hole',         tags: ['hypnotic','night'],
        line: 'You are The Rabbit Hole: each track is one step further from where we started, and there is no way back.' },
      { label: 'Strange but Good',        tags: ['weird','warm'],
        line: 'You are Strange but Good: odd picks that win people over by the second chorus.' },
      { label: 'The Wildcard',            tags: ['weird','fast'],
        line: 'You are The Wildcard: unpredictable, confident, never boring.' },
      { label: 'The Scenic Route',        tags: ['slow','cinematic'],
        line: 'You are The Scenic Route: you take the long way round on purpose, and it is worth it.' },
      { label: 'Don\'t Ask, Just Listen', tags: ['raw','dark'],
        line: 'You are Don\'t Ask, Just Listen: no explanations, no apologies, total conviction.' },
      { label: 'The Strange Machine',     tags: ['electronic','weird','cold'],
        line: 'You are The Strange Machine: deadpan and mechanical, picking with a logic nobody else can quite follow.' },
      { label: 'Suspiciously Good',       tags: ['polished','bright'],
        line: 'You are Suspiciously Good: every track lands so well it feels rigged.' },
      { label: 'The Happy Accident',      tags: ['light','warm'],
        line: 'You are The Happy Accident: this set sounds like a mistake that went right.' },
      { label: 'Musical Mischief',        tags: ['weird','social','fast'],
        line: 'You are Musical Mischief: playful, cheeky, enjoying yourself at the listener\'s expense — kindly.' },
      { label: 'Broship Radio',           tags: ['social','warm','raw'],
        line: 'You are Broship Radio: the mate with the aux cable who actually has taste.' },
      { label: 'Where Did This Come From?',tags: ['weird','retro'],
        line: 'You are Where Did This Come From?: every track makes the listener ask exactly that.' }
    ]
  },

  /* ── optional categories: built in, switched off until wanted, so the
     default menu stays short. "More settings" turns them on. ── */

  {
    key: 'energy',
    label: 'Energy',
    icon: '⚡',
    order: 60,
    enabled: false,
    placeholder: 'How hard should it hit?',
    options: [
      { label: 'Low / hypnotic',    tags: ['calm','hypnotic','slow','still'] },
      { label: 'Gradually building',tags: ['motion','slow','cinematic'],
        line: 'Build the energy gradually across the set — start low, end high.' },
      { label: 'High energy',       tags: ['fast','intense','bright'] },
      { label: 'Absolutely mental', tags: ['fast','intense','heavy','weird'] }
    ]
  },

  {
    key: 'era',
    label: 'Era',
    icon: '📻',
    order: 70,
    enabled: false,
    placeholder: 'When are we?',
    options: [
      { label: '70s',      tags: ['retro','organic','warm'] },
      { label: '80s',      tags: ['retro','electronic','bright'] },
      { label: '90s',      tags: ['retro','raw'] },
      { label: '2000s',    tags: ['modern','polished'] },
      { label: 'Modern',   tags: ['modern'] },
      { label: 'Any era',  tags: [] }
    ]
  },

  {
    key: 'speed',
    label: 'Speed',
    icon: '🏎',
    order: 80,
    enabled: false,
    placeholder: 'How fast?',
    options: [
      { label: 'Cruising',         tags: ['slow','motion','calm'] },
      { label: 'Fast',             tags: ['fast','motion'] },
      { label: 'Fucking flying',   tags: ['fast','intense','heavy'] }
    ]
  }
];

/* ── SPEED MODE PROMPT ──────────────────────────────────────────────────
   Kept here as a template rather than built line by line, because this is
   the thing most worth rewriting as we learn what different AIs do with
   it. {{placeholders}} are filled by djAi.buildSpeedPrompt().

   {{extras}} is where anything opened under "More settings" lands — it is
   an empty line when the listener kept it simple, which is the point of
   speed mode. {{listening}} drops out entirely when track data isn't
   shared, heading and all. */
var DJ_SPEED_PROMPT = `You are my DJ.

You are not recommending music. You are making me a playlist.

Your job has TWO PHASES.

PHASE 1 — BE THE DJ

Take my brief and listening history and make strong musical decisions.

Choose exactly {{track_count}} tracks and sequence them as a coherent musical journey.

Spend your effort on:

* song selection
* emotional journey
* sequencing
* discovery
* familiarity
* musical connections between tracks

Do not simply follow genre labels literally if a better musical journey takes us somewhere else.

Do not overthink the playlist. Make confident decisions and keep moving.

PHASE 2 — FIND THE YOUTUBE LINKS

After you have decided on the complete {{track_count}}-track playlist, search YouTube/web for each selected track.

Do NOT search first and then choose music from the search results.

The playlist comes first. YouTube URL resolution comes second.

For EACH selected track:

1. Search for the exact Artist + Track Title.
2. Find a real YouTube result for the exact recording.
3. Verify the result matches the artist, title, and intended recording/version.
4. Copy the actual watch URL from the search result.
5. Prefer the official artist/channel upload when available.
6. Otherwise use another legitimate YouTube upload containing the exact track.
7. Never construct a YouTube URL yourself.
8. Never invent, guess, or recall a YouTube video ID.
9. Never use a different song, remix, cover, live version, or similarly titled track unless it is clearly the intended recording.
10. If the first result is unsuitable, search again.

If a selected track genuinely cannot be matched to a real YouTube result, replace that track with another suitable track and search for its URL.

The final playlist must contain exactly {{track_count}} tracks and exactly {{track_count}} real YouTube URLs.

THE BRIEF

What are you doing?
{{activity}}

How should it feel?
{{feeling}}

Where should we go?
{{direction}}

Tonight's DJ personality:
{{dj_personality}}
{{extras}}{{discovery}}{{listening}}{{promoted}}
LENGTH

Tracks: {{track_count}}
Target length: approximately {{target_minutes}} minutes
Maximum track length: {{max_track_minutes}} minutes

Treat the target duration as approximate. Do not waste time trying to make the total duration exact.

DJ RULES

1. Choose real released tracks.
2. Do not repeat tracks.
3. Prioritise a good musical journey over perfect optimisation.
4. Sequence the tracks deliberately. The order matters.
5. Keep the overall playlist coherent, but allow some surprise.
6. Favour under-discovered artists without sacrificing quality.
7. Do not spend excessive time researching obscure alternatives.
8. Do not obsess over exact track duration.
9. If a candidate is difficult to identify, move on and choose another.
10. Do not explain why individual tracks were chosen.
11. Do not provide commentary before or after the playlist.
12. Return exactly {{track_count}} tracks.

The goal is not to find the mathematically perfect playlist.

The goal is to make the playlist feel like a good DJ made it.

OUTPUT

Return exactly this format:

RIFFROLLED-PLAYLIST
NAME: a short name for this set
1 | Artist | Track title | YouTube URL | duration | genre
2 | Artist | Track title | YouTube URL | duration | genre
3 | Artist | Track title | YouTube URL | duration | genre
...
{{track_count}} | Artist | Track title | YouTube URL | duration | genre
END

One track per line.

Do not add any other text.`;

/* The DISCOVERY block, which only appears when a discovery brief or a
   familiarity other than the default has been set. The caveat after the
   discovery line is fixed: without it "under-discovered" turns into a
   crate-digging exercise and the music suffers. */
var DJ_DISCOVERY_BLOCK = `
DISCOVERY

{{discovery_line}}
Do not turn this into an obscure-music exercise. A great song from a known artist is welcome when it improves the journey.
{{familiarity}}`;

var DJ_FAMILIARITY_BLOCK = `
Familiarity:
Roughly {{familiar_pct}}% things I might know, {{discovery_pct}}% discovery.
Treat familiarity as a feel, not arithmetic.
`;

/* The listening block, only when track data is shared. Speed mode shares
   the top ten and nothing else — enough to show taste, small enough to
   read in a second. */
var DJ_SPEED_LISTENING = `
WHAT I ALREADY LISTEN TO

Here are my 10 most-played tracks:

{{top_10_tracks}}

Use these as a quick indication of my taste.

Do not simply give me more of the same.

Look for the underlying musical characteristics I respond to, then make your own DJ decisions.
`;

/* The promoted block. Only present when the listener has turned
   promotional tracks on, and only when something actually matched the
   brief — riffrolled never pads this list to look busy.

   The wording does three jobs. It tells the AI these are paid, so it is
   not misled into treating them as riffrolled's own recommendations. It
   tells the listener the same thing, because the listener reads this text
   too — it is sitting in their clipboard. And it explicitly releases the
   AI from any obligation to use them, because a placement that bends the
   brief is worth nothing to anybody: the listener gets a worse playlist,
   and the promoter pays for attention that turns into a skip.

   It does not ask the AI to annotate its reply. That would be unreliable
   (it may simply not) and it would put stray words in the cells the
   parser reads. riffrolled knows which video ids are promoted and labels
   them itself, in the playlist, every time they appear. */
var DJ_PROMOTED_BLOCK = `
PROMOTED TRACKS

These are paid placements. Somebody spent riff tokens to have them offered
to briefs like this one, and riffrolled picked these because the moods
they are tagged with match what I asked for above. Nobody paid for them to
end up in the playlist.

{{promoted_list}}

Judge them exactly as you would any other candidate. Include one only if
it genuinely makes the set better, and leave every one of them out if none
does — that is a perfectly good outcome and it is not a failure to follow
the brief. Do not reshape the brief around them.

You do not need to mark them in your reply. riffrolled knows which tracks
these are and labels them as promoted wherever they appear.
`;

/* Chaos lines. When chaos is on the brief says out loud that the
   combination is deliberate — that is what stops an AI treating a strange
   mix as contradictory instructions and handing back mush. */
var DJ_CHAOS_LINES = [
  'These choices do not obviously belong together. That is deliberate. Make the journey work anyway.',
  'This combination is intentionally awkward. Your job is to make it make sense.',
  'Yes, really — that combination. Treat the collision as the brief, not as a mistake.'
];
