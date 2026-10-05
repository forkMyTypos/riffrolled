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

Your job is to take my brief, use what you know about my listening taste, make strong musical decisions, and create a good journey through the music.

This is SPEED MODE.

Do not overthink the playlist. Do not perform exhaustive research. Do not explain your decisions. Spend your effort choosing and sequencing good music.

Make confident decisions and keep moving.

## THE BRIEF

What are you doing?
{{activity}}

How should it feel?
{{feeling}}

Where should we go?
{{direction}}

Tonight's DJ personality:
{{dj_personality}}
{{extras}}
## LENGTH

Tracks: {{track_count}}
Target length: approximately {{target_minutes}} minutes
Maximum track length: {{max_track_minutes}} minutes

Treat the target duration as approximate. Do not waste time trying to make the total duration exact.
{{listening}}
## SPEED MODE RULES

1. Make the playlist quickly.
2. Prioritise a good musical journey over perfect optimisation.
3. Choose real released tracks.
4. Do not repeat tracks.
5. Do not spend excessive time researching obscure alternatives.
6. Do not obsess over exact track duration.
7. If a candidate is difficult to verify or identify, move on and choose another.
8. Only include a YouTube link you have actually looked up. Otherwise leave the cell empty — never write a video ID from memory.
9. Keep the overall playlist coherent, but allow some surprise.
10. Do not simply follow genre labels literally if a better musical journey takes us somewhere else.
11. Do not explain why individual tracks were chosen.
12. Do not provide commentary before or after the playlist.
13. Return exactly {{track_count}} tracks.

The goal is not to find the mathematically perfect playlist.

The goal is to make a playlist that feels like a good DJ made it.

## LINKS — READ THIS CAREFULLY

Every track plays from YouTube, so a real link is useful. Only a real one.

If you can search the web: search YouTube for each track and copy the exact watch URL from the result you actually saw.

If you cannot search, or you are not certain a particular video exists: LEAVE THE LINK CELL EMPTY.

An empty link cell is a correct answer. riffrolled finds the track from the artist and title, which costs it nothing.

Never write a YouTube video ID from memory. IDs are random eleven-character strings. One that looks plausible is almost always wrong, and a wrong link is the only answer here that cannot be recovered from — it puts a dead track in my playlist.

Getting the artist and title exactly right matters more than supplying a link.

## OUTPUT

Return exactly this format:

RIFFROLLED-PLAYLIST
NAME: a short name for this set
1 | Artist | Track title | YouTube URL or empty | duration | genre
2 | Artist | Track title | YouTube URL or empty | duration | genre
3 | Artist | Track title | YouTube URL or empty | duration | genre
...
END

One track per line. Keep the empty cell between the pipes when you have no link.

Do not add any other text.`;

/* The listening block, only when track data is shared. Speed mode shares
   the top ten and nothing else — enough to show taste, small enough to
   read in a second. */
var DJ_SPEED_LISTENING = `
## WHAT I ALREADY LISTEN TO

Here are my 10 most-played tracks:

{{top_10_tracks}}

Use these as a quick indication of my taste.

Do not simply give me more of the same.

Use them to understand the kind of music I respond to, then make your own DJ decisions.
`;

/* Chaos lines. When chaos is on the brief says out loud that the
   combination is deliberate — that is what stops an AI treating a strange
   mix as contradictory instructions and handing back mush. */
var DJ_CHAOS_LINES = [
  'These choices do not obviously belong together. That is deliberate. Make the journey work anyway.',
  'This combination is intentionally awkward. Your job is to make it make sense.',
  'Yes, really — that combination. Treat the collision as the brief, not as a mistake.'
];
