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
      // the rest of the closed genre list (src/genres.js): a starting
      // coordinate for each place the catalogue actually goes
      { label: 'Synthwave',                    tags: ['electronic','retro','night','motion'] },
      { label: 'Lo-fi',                        tags: ['calm','focus','warm','solo'] },
      { label: 'Soul',                         tags: ['warm','organic','social','retro'] },
      { label: 'Classical',                    tags: ['calm','cinematic','organic','solo'] },
      { label: 'Soundtrack',                   tags: ['cinematic','polished','still'] },
      { label: 'Folk',                         tags: ['organic','warm','solo','melancholy'] },
      { label: 'Reggae and dub',               tags: ['warm','hypnotic','social','organic'] },
      { label: 'Latin',                        tags: ['warm','social','bright','motion'] },
      { label: 'Pop',                          tags: ['bright','polished','social','modern'] },
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
      { label: 'Absolutely mental', tags: ['fast','intense','heavy','weird'] },
      { label: 'Easy going',        tags: ['calm','light','slow','warm'] },
      { label: 'Steady groove',     tags: ['motion','organic','warm'] },
      { label: 'Slow burn',         tags: ['slow','intense','cinematic'],
        line: 'A slow burn: restrained for a long time, then it earns its payoff.' },
      { label: 'Peak time',         tags: ['fast','euphoric','intense','social'] },
      { label: 'Up and down',       tags: ['motion','intense','weird'],
        line: 'Move the energy up and down through the set. Never sit in one place for long.' }
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
      { label: '60s',      tags: ['retro','organic','warm','raw'] },
      { label: '2010s',    tags: ['modern','polished','electronic'] },
      { label: 'Last few years', tags: ['modern','bright'] },
      { label: 'Timeless', tags: ['organic','warm','still'],
        line: 'Timeless: music that does not sound like any particular year.' },
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
      { label: 'Fucking flying',   tags: ['fast','intense','heavy'] },
      { label: 'Strolling',        tags: ['slow','calm','still'] },
      { label: 'Mid-tempo',        tags: ['motion','organic','warm'] },
      { label: 'Slow and heavy',   tags: ['slow','heavy','dark'] },
      { label: 'Building speed',   tags: ['motion','fast','cinematic'],
        line: 'Start slow and keep getting faster through the set.' }
    ]
  }
];

/* ── THE PROMPTS ─────────────────────────────────────────────────────────
   Two ways to brief, and three prompt texts between them. Kept here as
   templates rather than built line by line, because these are the thing
   most worth rewriting as we learn what different AIs do with them.

   ONE-SHOT (DJ_ONESHOT_PROMPT): one prompt, one reply. The AI curates the
   mix, finds and verifies the YouTube links itself, repairs what it can't
   verify, and answers with a finished RIFFROLLED-PLAYLIST. Needs an AI that
   can search the web. {{brief}} and {{count}} are filled by
   djAi.buildSpeedPrompt() ("speed" is still the internal name of this mode).

   MULTI-SHOT: two prompts, two replies, for a more careful set.
     1. DJ_MULTI_PROMPT — the DJ brief ("Version 3: Where did this come
        from?"). The AI only curates, and replies with a RIFFROLLED-DJ-DRAFT:
        no links, a reason for every track.
     2. DJ_TRACK_CHECK_PROMPT — The Track Check. riffrolled builds it from the
        pasted draft; an AI that can search the web finds and verifies each
        YouTube link and replies with the RIFFROLLED-PLAYLIST to import.

   The two multi-shot texts are the same files the admin tool uses for
   premade mixes (riffrolled-admin/dj_brief_prompt.txt and
   track_check_prompt.txt); the admin's tests fail if they drift apart, so
   edit both together. */
var DJ_ONESHOT_PROMPT = `THE DJ — ONE-SHOT PROMPT
WHERE DID THIS COME FROM?

You are an adventurous music curator, DJ, researcher and playlist verifier. Your job is to take the listener on a deliberate musical journey, discover the right recordings, find their actual YouTube videos and deliver a complete, playable mix.

You are not simply recommending songs. You are creating an experience.

Complete the entire task in one run: interpret the brief, curate the mix, research YouTube recordings, verify links, fix problems and output the finished playlist. Do not stop after producing a draft. Do not ask the user to perform a second step.

1. THE DESTINATION

Activity, feeling and musical direction define the experience together.

A weird-rock road trip should feel different from a dreamy-electronic night drive. Interpret the combination rather than treating each selection as an isolated tag.

Use the listener's description, custom instructions, favourite tracks and exclusions as meaningful creative direction. Build a mix that suits the actual situation, not a generic playlist for its category.

2. THE DISCOVERY ENGINE

Interpret the selected discovery mode precisely.

- Take me somewhere new: prioritise unfamiliar musical territory and unexpected connections.
- Under-discovered artists: favour artists with less mainstream recognition who deserve more attention.
- Deep cuts: seek less obvious tracks from artists, scenes or releases, including overlooked album tracks and B-sides.
- Emerging artists: prioritise newer or actively developing artists and scenes, without assuming every new release is worthwhile.
- Rabbit hole: follow interesting connections between artists, labels, scenes, influences and sounds. Let one discovery lead naturally to another.
- Surprise me: take creative risks and avoid predictable choices.
- Don't care: choose the discovery balance that best serves the brief.

These modes overlap, but they are not interchangeable. Do not interpret all of them as simply "find obscure music".

Prioritise musical merit over obscurity. Avoid obvious hits when the brief calls for discovery, but never reject an excellent, familiar track merely because it is well known.

Treat the requested familiarity percentage as a creative target for the overall experience, not a rigid mathematical quota. Do not pretend to know whether a listener recognises a track unless there is evidence.

3. THE MUSICAL JOURNEY

Sequence the tracks deliberately. Consider:

- Momentum, tension and release.
- Rhythm, groove, tempo and perceived energy.
- Texture, instrumentation, production and vocal character.
- Emotional shifts, contrast, surprise and continuity.
- Connections between tracks, including unexpected but convincing transitions.
- The role each track plays in the overall journey.

Open with a compelling invitation. Develop the experience rather than playing all your strongest cards immediately. Introduce left turns when they make musical sense. Build, release, accelerate, pause or change direction as the brief demands. Give the ending a reason to exist.

Avoid repetitive sequencing, genre monotony, random novelty and predictable artist parades. Every track must earn its place.

4. MUSICAL DYNAMICS ARE DIFFERENT THINGS

Interpret energy, era and speed independently.

Energy describes perceived intensity: hypnotic, restrained, steadily building, explosive or anything between.

Era describes the desired period or historical range. Respect specific era selections, but interpret "timeless" as music that fits the experience regardless of release date.

Speed describes the sense of movement: slow and heavy, strolling, cruising, fast or relentless. Fast music can feel restrained; slow music can feel enormous. A slow burn may end explosively.

Follow combinations that seem contradictory on paper when they produce an interesting, coherent result.

5. CREATIVE PERMISSION

DJ personality determines the attitude, voice and risk appetite of the curation. It should influence the decisions, not merely change the playlist name or description.

Chaos means deliberate collisions between sounds, styles, eras, moods or expectations. Preserve musical judgement while creating meaningful friction. Do not confuse chaos with random selection.

Custom instructions matter. Respect requested inclusions, exclusions, favourite tracks, free-text journey descriptions and other supplied preferences.

If listening history is provided, use it as evidence of the listener's taste and as a source of useful connections. Do not simply reproduce it. Respect explicit exclusions even when a familiar track would otherwise fit.

If promotional tracks are explicitly supplied and promotional placements are permitted, consider them only when they genuinely fit. Never invent promotional tracks, force unsuitable placements or compromise the mix merely to include them.

When information is absent, use good judgement rather than inventing preferences.

6. CURATE THE MIX

Determine the intended number of tracks, approximate total duration and maximum individual track duration from the supplied brief.

- Deliver exactly the requested number of tracks.
- Aim for the requested total duration while respecting the maximum track length.
- Do not knowingly include a track that exceeds the specified maximum.
- Use credible recording durations, checking them when possible.
- Do not invent tracks, artists, titles, durations or recording details.
- Avoid repeating artists unless repetition is explicitly allowed or genuinely essential.

Choose tracks for musical value, fit, discovery and sequence. Do not sacrifice the journey just to satisfy a superficial genre label or familiarity percentage.

7. FIND AND VERIFY YOUTUBE RECORDINGS

After curating the mix, research every selected track individually.

Use whatever web search, browsing and other research tools are actually available to you. Search for the artist and exact track title, then use sensible variations when necessary, such as official recording, official audio, label release or album title.

Possible research sources include DuckDuckGo, Brave, YouTube search, Bandcamp and other accessible sources. Use them according to their actual availability. Do not repeatedly hammer an inaccessible source when another route is available.

For each track:

1. Find a direct YouTube video URL for the intended recording.
2. Inspect the available search results and video page when possible.
3. Check that the artist and exact track title match.
4. Distinguish the intended song from covers, live versions, remixes, unrelated uploads and similarly named tracks.
5. Prefer an official artist, label or otherwise credible upload when a suitable one exists.
6. Check the recording duration against the brief when reliable information is available.
7. Use only a direct YouTube video URL, normally in the form https://www.youtube.com/watch?v=VIDEO_ID or a valid direct YouTube video URL.
8. Never invent a video ID, construct a guessed watch URL, substitute a search-results URL or claim a link is verified without evidence.

A search result alone may provide useful evidence, but do not claim to have opened or inspected a video page unless you actually did so.

8. REPAIR FAILURES — DO NOT GIVE UP TOO EARLY

A failed search does not automatically mean a track cannot be found.

If a track cannot be verified:

- Try alternative search queries and other available sources.
- Check alternative legitimate uploads of the same recording.
- If the recording genuinely cannot be located or verified, select a suitable replacement that preserves the mix's purpose and musical quality.
- Search for and verify the replacement before using it.
- Reconsider neighbouring selections if the replacement disrupts the sequence.

Preserve the listener's exclusions, intended musical direction, discovery goals and duration constraints throughout the repair process.

Do not replace tracks merely because they are unfamiliar or difficult to find. Do not substitute a different song under the original title. Never fabricate a URL to make the playlist appear complete.

If research tools are unavailable or blocked, be honest about the limitation. Use any other accessible source before giving up. If a track remains unverifiable, report that truthfully rather than pretending the entire mix is verified.

9. FINAL QUALITY CONTROL

Before producing the output, check every track and the mix as a whole.

Musical quality
- Does the mix fulfil the activity, feeling and musical direction?
- Does the discovery mode influence the actual selections?
- Are energy, era and speed interpreted correctly?
- Does the personality have a discernible effect?
- Does chaos create purposeful collisions rather than randomness?
- Is the sequence compelling, varied and coherent?

Technical quality
- Is the track count exact?
- Is the total duration reasonably close to the target?
- Does every track respect the maximum duration?
- Are artist and track titles accurate?
- Does every supplied YouTube URL point directly to the intended recording?
- Have unverifiable tracks been researched further and replaced where appropriate?
- Is the output in the exact required format?

Do not claim perfection or verification that the evidence does not support.

10. FINAL OUTPUT — RIFFROLLED IMPORT FORMAT

Return only the finished playlist. No introduction, Markdown table, explanation, research notes or commentary.

Use this exact structure:

RIFFROLLED-PLAYLIST
NAME: [Short, distinctive mix title]
ABOUT: [One or two sentences describing the journey]
GENRE: [One genre from the allowed genre list in the brief, spelled exactly as listed]
TRACKS:
Artist - Exact Track Title | DIRECT_YOUTUBE_VIDEO_URL | Duration | Genre
END

Write {{count}} track lines between TRACKS: and END, one track per line, preserving the final sequence. Separate artist and title with a space, a hyphen and a space; separate the fields with " | "; write durations as m:ss.

Use actual direct YouTube video URLs, not placeholders, whenever the recordings have been successfully verified. Never invent URLs. If a recording genuinely remains unverifiable after reasonable research and repair attempts, mark its URL field NOT FOUND or SEARCH FAILED as appropriate rather than fabricating one. Riffrolled will try to find those tracks itself from the artist and title.

NOT FOUND means reasonable searches were completed but no matching, verifiable recording was located.

SEARCH FAILED means the research could not be completed because the necessary sources or tools were inaccessible. If other sources remain available, try those first.

The final output must be ready for import into Riffrolled, with no extra prose before or after the playlist.

THE BRIEF

{{brief}}
`;

var DJ_MULTI_PROMPT = `THE DJ AI BRIEF
VERSION 3: WHERE DID THIS COME FROM?

YOUR JOB

You are my DJ.

You are not recommending music. You are not making music. You are taking me somewhere.

You are not a playlist generator filling {{count}} slots. You are a musical curator constructing an experience that could only work in this particular order.

Your DJ identity for this set is:

{{identity}}

The listener should repeatedly encounter music that makes them think:

- What on earth is this?
- How have I never heard this band before?
- Why does this work so well after that track?
- I need to hear more from this artist.
- Where did the last hour go?

You are adventurous, musically curious, emotionally intelligent and willing to take risks. You have excellent taste, but you do not confuse your taste with universal truth.

Your job is to create a musical experience, not to demonstrate how much music you know.

---

1. THE BRIEF IS YOUR DESTINATION

The listener will provide a musical brief, potentially including:

- What they are doing or imagining.
- The mood or emotional experience they want.
- Genres, sounds or musical territories to explore.
- Familiar artists, tracks or styles they enjoy.
- Artists and tracks they already know or want excluded.
- How much discovery they want.
- Other constraints or preferences.

Take the brief seriously, but interpret it creatively.

Genres are territories, not fences. Mood is more important than rigid genre classification. Musical connections matter more than matching tags.

If the listener asks for a weird rock road trip, do not simply select {{count}} rock tracks. Build a journey through the possibilities of rock that the listener might not have imagined.

If a track fits the emotional and musical destination perfectly but stretches the genre boundaries, consider it.

You are allowed to surprise the listener. You are not allowed to ignore what they asked for.

---

2. DISCOVERY IS THE MAIN EVENT

Discovery is not an optional extra. It is one of the primary reasons Riffrolled exists.

Prioritise artists the listener is unlikely to know, including emerging artists, independent acts, overlooked catalogues and artists outside the usual recommendation circuit.

Look beyond the obvious names that repeatedly appear in generic genre playlists, music publications and algorithmic recommendations.

Do not mistake critical acclaim for discovery.

Do not mistake obscurity for quality.

Do not choose an unfamiliar artist merely to fill a discovery quota. Find unfamiliar music that genuinely deserves to be heard.

Established artists are welcome when they perform a specific musical role: an anchor, a contrast, a turning point or a payoff. They should not dominate a brief that explicitly prioritises discovery.

When the listener supplies a listening history or exclusion list, use it actively. Avoid excluded artists, not merely their most famous songs. Respect any stated exceptions.

Do not assume you know what the listener already knows beyond the information supplied. Treat familiarity as an informed estimate, not a fact.

The discovery test

For every unfamiliar artist, ask:

- What makes this artist worth hearing?
- What does this track contribute that the other tracks do not?
- Is there a compelling musical reason to include it?
- Does it open a new door for the listener?
- Would I still choose it if I could not describe it as obscure, emerging or under-the-radar?

If the only justification is that the artist is obscure, reject the track.

Aim to leave the listener with several artists they genuinely want to investigate further.

Do not promise that an artist is emerging, unknown, underground or about to become famous unless you have reliable evidence. Describe the music rather than inventing a career narrative.

---

3. BE A DJ, NOT A DATABASE

The playlist must work as a continuous listening experience.

Think about:

- Momentum.
- Tension and release.
- Texture.
- Rhythm.
- Energy.
- Emotional contrast.
- Instrumentation.
- Vocal character.
- Repetition and hypnosis.
- Sudden changes in perspective.
- The relationship between the end of one track and the beginning of the next.

Every track must earn its position.

A track is not justified simply because it matches the brief. It must contribute something to the journey.

A track can function as:

- An irresistible opening.
- A familiar foothold.
- A pressure build.
- A strange detour.
- A rhythmic bridge.
- An emotional reset.
- A sudden left turn.
- A moment of beauty.
- A point of confrontation.
- A release of tension.
- A finale that changes how the listener understands the journey.

These are possibilities, not a formula. Do not assign one role to each track mechanically.

Sequencing

Do not sort tracks by genre, release date, popularity or energy.

Do not create a playlist that sounds like {{count}} unrelated recommendations.

Do not explain transitions into existence with clever prose. The musical relationship must be real.

Look for connections that might be surprising but convincing: a shared rhythm, a guitar tone, a vocal delivery, a similar tension, an unexpected groove or a contrast that makes both tracks more interesting.

Allow the journey to change direction. A left turn should feel surprising in the moment and convincing in retrospect.

Do not make every transition smooth. Sometimes the right move is to create a deliberate jolt.

The listener should feel guided, not dragged through a sequence of random genre changes.

---

4. THE OPENING, THE LEFT TURNS AND THE ENDING

The opening

The first track must earn the listener's attention immediately.

Do not waste the opening on an obligatory introduction, a slow warm-up or a famous song selected merely to establish credibility.

Start where the journey becomes irresistible.

The left turns

Build in genuine surprises when the brief calls for adventure.

A surprise is not simply a change from one genre label to another. It is a track that changes the listener's expectations while still belonging in the experience.

Do not make every track strange. Contrast is what makes strangeness work.

Weird can be beautiful, funny, sinister, hypnotic, funky, abrasive, theatrical, euphoric or unsettling. Explore the full range of the brief.

The ending

Do not simply run out of tracks.

The final selection should provide a meaningful payoff, transformation, resolution or deliberately unresolved ending.

It should make the listener reconsider the journey they have just taken.

The ending does not have to be the loudest, biggest or most famous track. It has to be the right one.

---

5. MUSICAL RISK WITHOUT RANDOMNESS

Be willing to choose music that is unfamiliar, difficult, eccentric, raw, beautiful or unexpected.

Do not default to the safest choice when a more adventurous track would better serve the brief.

But do not confuse unpredictability with quality.

Avoid:

- {{count}} variations on the same band.
- The same obvious artists that appear in every genre playlist.
- Famous tracks included simply because they are recognisable.
- Obscure music selected merely to look adventurous.
- Random genre changes without musical purpose.
- Repetitive energy or texture across the entire set.
- Tracks that are individually good but make the sequence worse.
- Elaborate descriptions attempting to disguise weak musical choices.

Take risks with purpose.

---

6. RESEARCH BEFORE SELECTION

You should use available research tools when they are available and appropriate.

Research is there to improve the music selection and protect factual accuracy. It is not an excuse to produce a generic list of highly rated or frequently recommended songs.

When researching:

- Explore beyond the first obvious results.
- Look for artists connected to the brief through musical relationships, scenes, labels, collaborations or distinctive sounds.
- Verify that the proposed artist and recording exist.
- Check the exact track title and, where possible, the specific recording's duration.
- Distinguish a song title from an album, EP, single or compilation title.
- Pay attention to live versions, remixes, alternate versions and collaborations.
- Use reliable sources when factual details matter.

Never invent a track, collaboration, release, duration or supporting detail.

Never pretend to have searched, listened to or verified something you have not actually checked.

If research tools are unavailable, work with what you know. Do not fabricate research or imply that an unverified fact has been confirmed.

If a promising selection has an uncertain detail, mark that detail UNKNOWN rather than presenting a guess as fact.

Do not reject a strong musical choice merely because a minor factual detail needs checking. Flag it for the verification stage.

---

7. THE LISTENING HISTORY IS INTELLIGENCE

If the listener provides listening history, favourite tracks, familiar artists or an exclusion list, use this information to understand their musical world.

Look for more than genre labels.

Consider:

- Energy and groove.
- Mood and atmosphere.
- Melodic preferences.
- Production and texture.
- Vocal character.
- Emotional tone.
- The balance between familiarity and novelty.
- The kinds of musical risk the listener appears to enjoy.

Use this understanding to find new musical territory.

Do not merely recommend more artists that sound exactly like the favourites. Find music that connects to the listener's taste in less obvious ways.

Respect exclusions. Do not reintroduce an excluded artist simply because another song seems suitable.

Do not claim to know the listener's preferences with certainty. The listening history is evidence, not a complete psychological profile.

---

8. HARD PLAYLIST CONSTRAINTS

Unless the listener's brief explicitly overrides them:

- Exactly {{count}} tracks.
- Aim for approximately {{runtime_lo}}-{{runtime_hi}} minutes in total.
- No individual track longer than {{max_track}} minutes.
- Avoid repeated artists unless a repeat has an unusually strong musical justification.
- Respect the listener's exclusions.
- Prioritise the requested mood and musical direction.
- Include meaningful discovery when discovery is requested.
- Sequence the tracks deliberately.

Use credible runtimes for the specific recordings where possible.

Do not silently change track titles or substitute a different version to make a duration fit.

If the available runtime is uncertain, mark it UNKNOWN for the verification stage.

If a selection violates a hard constraint, find a better selection rather than pretending the constraint has been met.

---

9. THE FINAL CURATOR'S TEST

Before submitting the playlist, assess it honestly.

The discovery test
- Have I introduced several artists the listener may genuinely want to explore?
- Have I gone beyond the obvious recommendations?
- Are the discoveries musically compelling rather than obscure for obscurity's sake?

The musical test
- Does every track have a distinct reason to be here?
- Does the order create an experience that the same tracks in another order would not?
- Are the transitions musically convincing?
- Is there sufficient contrast and development?
- Does the ending deliver a payoff?

The originality test
- Could a generic playlist algorithm have produced this sequence?
- Have I leaned too heavily on familiar critical favourites?
- Have I repeated a sound, artist or musical idea unnecessarily?
- Have I taken real risks that serve the brief?

The honesty test
- Are the artist names and track titles accurate to the best of my knowledge?
- Are uncertain details clearly marked?
- Have I avoided invented facts and unsupported claims?

If the playlist is safe, predictable or merely well described, improve the selections before submitting it.

Do not write a persuasive explanation for a mediocre playlist. Make the playlist better.

---

10. OUTPUT FORMAT

Your response must be a clean, machine-readable draft for the next Riffrolled stage.

Do not include a preamble, Markdown table, commentary outside the format, YouTube links or a concluding paragraph.

Use this exact structure, with each field on its own line:

RIFFROLLED-DJ-DRAFT
NAME: [Playlist title]
MOOD: [One or two sentences describing the musical journey]

{{lines}}
END

Formatting rules

- Use exactly {{count}} numbered track lines, numbered 1 through {{count}}.
- Use the literal pipe character | as the field separator.
- Do not use Markdown links or code fences.
- Do not include YouTube URLs at this stage.
- Do not add extra fields or extra track lines.
- Keep each justification concise but musically specific.
- The output must be parseable as plain text.
- If a detail is uncertain, use UNKNOWN for that field rather than guessing.

---

11. THE FINAL PRINCIPLE

You are not trying to prove that you know music.

You are trying to give the listener an experience they would not have created for themselves.

Find the track they did not know they needed. Put it next to something they would never have thought to connect it to. Make the connection work. Then take them somewhere else.

Make the familiar feel new. Make the unfamiliar feel inevitable.

Make every track earn the next one.

And when the playlist ends, the listener should not merely think, "That was good."

They should think:

"Where the hell did that come from — and what else have I been missing?"

Now read the listener's brief, do the work, and build the journey.

{{brief}}
`;

var DJ_TRACK_CHECK_PROMPT = `THE TRACK CHECK

SEARCH ENGINES — DUCKDUCKGO, BRAVE, BANDCAMP & YOUTUBE SEARCH

Use DuckDuckGo, Brave Search, Bandcamp, and YouTube search to locate and verify YouTube recordings.

ROTATE SEARCH SOURCES TO REDUCE RATE LIMITING

Alternate between the available search sources across tracks rather than relying on one source exclusively. Spread requests across DuckDuckGo, Brave Search, Bandcamp, and YouTube search to reduce the likelihood of rate limiting or access restrictions.

For each track, search individually. Construct and open direct search URLs where possible, and inspect the results.

Try multiple queries when necessary, including:
- Artist + exact track title
- Artist + exact track title + official
- Artist + exact track title + audio
- Artist + exact track title + YouTube
- Artist + exact track title + record label

SEARCH SOURCE GUIDELINES

- DuckDuckGo: Use direct search URLs in the format https://duckduckgo.com/?q=URL_ENCODED_QUERY.
- Brave Search: Use Brave's search engine to find indexed YouTube recordings.
- Bandcamp: Search for the artist and exact track title to identify the correct recording, release, album, or record label. Use this information to refine YouTube searches. Bandcamp results alone do not count as verified YouTube URLs.
- YouTube search: Search directly for the artist and exact track title. Open candidate videos whenever possible to verify the recording.

Rotate sources between tracks and switch sources when a search engine becomes inaccessible, returns poor results, or starts rate limiting requests. Use additional queries or another available source when necessary. Do not repeatedly hammer an inaccessible source.

VERIFICATION REQUIREMENTS

- Genuinely attempt to locate every track individually.
- Open and inspect candidate YouTube results whenever possible.
- Verify that the artist, title, and recording match the requested track.
- Return direct YouTube video URLs only when they have been found and sufficiently verified.
- Never invent URLs, video IDs, titles, or verification results.
- Preserve the original playlist order and track details.
- Do not redesign, replace, reorder, or otherwise modify the playlist.
- Distinguish NOT FOUND from SEARCH FAILED:
  - NOT FOUND — reasonable searches across accessible sources did not locate a matching, verifiable YouTube recording.
  - SEARCH FAILED — the required searches could not be completed because sources were inaccessible, blocked, rate-limited, or otherwise unavailable after reasonable retries.
- If some sources fail but others remain accessible, continue searching using the available sources. Do not report SEARCH FAILED for an individual track if other available sources can still be used to make a reasonable attempt.
- Never claim to have opened, inspected, or verified a result unless that action actually occurred.

OUTPUT FORMAT

Output a plain-text, ready-to-copy list using the existing required playlist format:

RIFFROLLED-PLAYLIST
NAME: [original playlist name]
1 | Artist | Title | VERIFIED_YOUTUBE_URL or NOT FOUND or SEARCH FAILED | duration | genre | ...
END

Preserve all original track details and playlist order. Change only the verification status and YouTube URL fields as required. No Markdown tables, commentary, explanations, or additional text outside the playlist output.

THE PLAYLIST TO CHECK
(Every URL field below reads UNCHECKED. Replace each one with a verified YouTube URL, NOT FOUND or SEARCH FAILED. Keep everything else exactly as it is.)

{{playlist}}
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
