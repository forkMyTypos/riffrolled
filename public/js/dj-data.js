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

  /* ── THE RIFFENATOR vocabulary (Dan, Oct 2026) ──
     `vibe` is the three describing words shown beside each option and
     handed to the AI with it. `tags` are those words mapped onto the 29
     mood words promotions match on (src/tags.js) — that is what Riff Roll
     weights by and what a promoted track is matched against, so it stays a
     closed set. `blurb` is a personality's one-liner. */
  {
    key: 'activity',
    label: 'What are you doing?',
    icon: '🚗',
    order: 10,
    enabled: true,
    placeholder: 'Pick what you\'re up to…',
    options: [
      { label: 'Cleaning', tags: ['motion','bright','fast'], vibe: ['motion','bright','fast'] },
      { label: 'Working', tags: ['focus','calm','still'], vibe: ['focus','calm','still'] },
      { label: 'Chilling', tags: ['calm','still','warm'], vibe: ['calm','still','warm'] },
      { label: 'Cooking', tags: ['warm','social','day'], vibe: ['warm','social','day'] },
      { label: 'Exercise', tags: ['fast','intense','motion'], vibe: ['fast','intense','motion'] },
      { label: 'Messing about', tags: ['weird','light','social'], vibe: ['weird','light','social'] },
      { label: 'Funeral', tags: ['ritual','melancholy','still'], vibe: ['ritual','melancholy','still'] },
      { label: 'Gaming', tags: ['intense','focus','electronic'], vibe: ['intense','focus','electronic'] },
      { label: 'Getting ready', tags: ['bright','euphoric','fast'], vibe: ['bright','euphoric','fast'] },
      { label: 'Late-night drinking', tags: ['night','social','melancholy'], vibe: ['night','social','melancholy'] },
      { label: 'Night drive', tags: ['night','motion','solo'], vibe: ['night','motion','solo'] },
      { label: 'Just Because', tags: ['light','weird'], vibe: ['open','casual','curious'] },
      { label: 'Party', tags: ['social','euphoric','fast'], vibe: ['social','euphoric','fast'] },
      { label: 'Reading', tags: ['calm','still','focus'], vibe: ['calm','still','focus'] },
      { label: 'Road trip', tags: ['motion','day','bright'], vibe: ['motion','day','bright'] },
      { label: 'Walking', tags: ['motion','day','light'], vibe: ['motion','outdoors','open'] },
      { label: 'Studying', tags: ['focus','calm'], vibe: ['focus','calm','steady'] },
      { label: 'Dancing', tags: ['motion','euphoric'], vibe: ['rhythm','motion','euphoric'] },
      { label: 'Falling asleep', tags: ['night','calm','slow'], vibe: ['night','calm','drifting'] },
      { label: 'Date night', tags: ['warm'], vibe: ['intimate','warm','sensual'] },
      { label: 'Wandering', tags: ['weird','motion','light'], vibe: ['curious','motion','open'] },
      { label: 'Feeling blue', tags: ['melancholy','still','slow'], vibe: ['melancholy','reflective','slow'] },
      { label: 'Waking up', tags: ['day','bright','calm'], vibe: ['morning','bright','gentle'] },
      { label: 'Showering', tags: ['warm','motion','light'], vibe: ['warm','motion','playful'] },
      { label: 'Gardening', tags: ['day','calm','organic'], vibe: ['outdoors','calm','organic'] },
      { label: 'Making art', tags: ['focus','weird'], vibe: ['creative','focus','exploratory'] },
      { label: 'Writing', tags: ['focus','still'], vibe: ['focus','reflective','steady'] },
      { label: 'Driving', tags: ['motion','solo','light'], vibe: ['motion','solo','open'] },
      { label: 'Beach day', tags: ['day','warm','calm'], vibe: ['sun','warm','relaxed'] },
      { label: 'Drinking alone', tags: ['solo','night','still'], vibe: ['solo','night','reflective'] },
      { label: 'Getting over someone', tags: ['melancholy','euphoric'], vibe: ['heartbreak','melancholy','release'] },
      { label: 'Celebrating', tags: ['euphoric','social','bright'], vibe: ['euphoric','social','bright'] },
      { label: 'Pre-drinks', tags: ['social','light','fast'], vibe: ['social','playful','rising energy'] },
      { label: 'After the party', tags: ['night','hypnotic','still'], vibe: ['night','hazy','reflective'] },
      { label: 'Being a menace', tags: ['weird'], vibe: ['mischievous','weird','chaotic'] },
      { label: 'Existential crisis', tags: ['solo','weird','intense'], vibe: ['introspective','strange','intense'] },
      { label: 'Nostalgia trip', tags: ['retro','melancholy','still'], vibe: ['familiar','wistful','reflective'] },
      { label: 'Rainy day', tags: ['still','warm','calm'], vibe: ['rain','intimate','mellow'] },
      { label: 'Housework', tags: ['motion','focus'], vibe: ['motion','steady','practical'] },
      { label: 'Recovery day', tags: ['calm','warm'], vibe: ['gentle','warm','restorative'] },
      { label: 'Farewell', tags: ['ritual','melancholy','still'], vibe: ['ritual','melancholy','reflective'] },
      { label: 'Remembering', tags: ['retro','still','warm'], vibe: ['nostalgic','reflective','warm'] },
      { label: 'Mourning', tags: ['melancholy','still'], vibe: ['grief','melancholy','still'] },
      { label: 'One Last Dance', tags: ['melancholy','euphoric'], vibe: ['bittersweet','euphoric','release'] },
      { label: 'Goodbye', tags: ['melancholy','still'], vibe: ['endings','reflective','melancholy'] }
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
      { label: 'Aggressive', tags: ['heavy','intense','fast'], vibe: ['heavy','intense','fast'] },
      { label: 'Mysterious', tags: ['dark','weird','hypnotic'], vibe: ['dark','weird','hypnotic'] },
      { label: 'Warm', tags: ['warm','organic','light'], vibe: ['warm','organic','light'] },
      { label: 'Beautiful', tags: ['light','polished','warm'], vibe: ['light','polished','warm'] },
      { label: 'Cinematic', tags: ['cinematic'], vibe: ['cinematic','dramatic','expansive'] },
      { label: 'Dark', tags: ['dark','night','cold'], vibe: ['dark','night','cold'] },
      { label: 'Dreamy', tags: ['hypnotic','light','slow'], vibe: ['hypnotic','light','slow'] },
      { label: 'Energetic', tags: ['fast','intense','bright'], vibe: ['fast','intense','bright'] },
      { label: 'Euphoric', tags: ['euphoric','bright','fast'], vibe: ['euphoric','bright','fast'] },
      { label: 'Sad', tags: ['melancholy','slow'], vibe: ['sorrowful','vulnerable','slow'] },
      { label: 'Melancholic', tags: ['melancholy','dark','slow'], vibe: ['melancholy','dark','slow'] },
      { label: 'Relaxed', tags: ['calm','warm','still'], vibe: ['calm','warm','still'] },
      { label: 'Tense', tags: ['intense','cold','dark'], vibe: ['intense','cold','dark'] },
      { label: 'Uplifting', tags: ['bright','euphoric','warm'], vibe: ['bright','euphoric','warm'] },
      { label: 'Weird', tags: ['weird','raw','hypnotic'], vibe: ['weird','raw','hypnotic'] },
      { label: 'Ethereal', tags: ['light','polished','slow'], vibe: ['airy','beautiful','drifting'] },
      { label: 'Raw', tags: ['raw','organic','intense'], vibe: ['rough','live','intense'] },
      { label: 'Futuristic', tags: ['electronic','polished','weird'], vibe: ['synthetic','sleek','strange'] },
      { label: 'Nostalgic', tags: ['melancholy','retro','warm'], vibe: ['wistful','familiar','warm'] },
      { label: 'Psychedelic', tags: ['hypnotic'], vibe: ['trippy','fluid','hypnotic'] },
      { label: 'Minimal', tags: ['still','polished'], vibe: ['sparse','restrained','precise'] },
      { label: 'Fed Up', tags: ['intense'], vibe: ['frustrated','aggressive','cathartic'] }
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
      { label: 'Something completely different', tags: ['weird','modern','raw'], vibe: ['weird','modern','raw'] },
      { label: 'Ambient', tags: ['calm','still','hypnotic'], vibe: ['calm','still','hypnotic'] },
      { label: 'Blues', tags: ['organic','warm','raw'], vibe: ['organic','soulful','raw'] },
      { label: 'Classical', tags: ['cinematic','organic','focus'], vibe: ['cinematic','organic','intricate'] },
      { label: 'Country & Americana', tags: ['organic','light'], vibe: ['organic','storytelling','open'] },
      { label: 'Electronic', tags: ['electronic','hypnotic','modern'], vibe: ['synthetic','hypnotic','modern'] },
      { label: 'Folk', tags: ['organic','warm'], vibe: ['organic','intimate','storytelling'] },
      { label: 'Funk', tags: ['motion','organic','social'], vibe: ['groove','organic','social'] },
      { label: 'Hip-hop', tags: ['motion','modern','raw'], vibe: ['rhythmic','modern','raw'] },
      { label: 'Indie', tags: ['raw','weird','melancholy'], vibe: ['alternative','exploratory','emotional'] },
      { label: 'Jazz', tags: ['organic','focus'], vibe: ['organic','improvisational','intricate'] },
      { label: 'Latin', tags: ['motion','warm','social'], vibe: ['rhythmic','warm','social'] },
      { label: 'Metal', tags: ['heavy','intense','dark'], vibe: ['heavy','intense','dark'] },
      { label: 'Pop', tags: ['light','polished','bright'], vibe: ['melodic','polished','bright'] },
      { label: 'Punk', tags: ['raw','fast'], vibe: ['raw','rebellious','fast'] },
      { label: 'R&B', tags: ['warm','motion'], vibe: ['soulful','rhythmic','warm'] },
      { label: 'Reggae & Dub', tags: ['heavy','warm','hypnotic'], vibe: ['bass-heavy','warm','hypnotic'] },
      { label: 'Rock', tags: ['organic','raw','fast'], vibe: ['organic','raw','energetic'] },
      { label: 'Soul', tags: ['warm','organic','melancholy'], vibe: ['warm','organic','emotional'] },
      { label: 'Soundtrack', tags: ['cinematic'], vibe: ['cinematic','dramatic','expansive'] },
      { label: 'Synthwave', tags: ['electronic','retro','night'], vibe: ['electronic','retro','night'] },
      { label: 'World', tags: ['organic','motion','weird'], vibe: ['global','rhythmic','exploratory'] },
      { label: 'Afrobeats', tags: ['motion','bright','modern'], vibe: ['rhythmic','bright','modern'] },
      { label: 'Afrobeat', tags: ['organic','motion'], vibe: ['organic','polyrhythmic','groove'] },
      { label: 'Amapiano', tags: ['hypnotic','motion'], vibe: ['deep','rhythmic','hypnotic'] },
      { label: 'Art pop', tags: ['weird','light','polished'], vibe: ['experimental','melodic','polished'] },
      { label: 'Baroque', tags: ['focus','polished','organic'], vibe: ['intricate','ornate','classical'] },
      { label: 'Big band', tags: ['organic','motion','fast'], vibe: ['brass','swing','energetic'] },
      { label: 'Bluegrass', tags: ['organic','focus','fast'], vibe: ['acoustic','intricate','lively'] },
      { label: 'Bossa nova', tags: ['warm','motion'], vibe: ['intimate','warm','rhythmic'] },
      { label: 'Breakbeat', tags: ['motion','electronic','fast'], vibe: ['syncopated','electronic','energetic'] },
      { label: 'Chamber music', tags: ['warm','focus','organic'], vibe: ['intimate','intricate','acoustic'] },
      { label: 'Chamber pop', tags: ['cinematic','warm','light'], vibe: ['orchestral','intimate','melodic'] },
      { label: 'City pop', tags: ['retro','polished','night'], vibe: ['retro','polished','nocturnal'] },
      { label: 'Contemporary classical', tags: ['modern','focus','cinematic'], vibe: ['modern','intricate','cinematic'] },
      { label: 'Cumbia', tags: ['motion','warm','social'], vibe: ['rhythmic','warm','danceable'] },
      { label: 'Dancehall', tags: ['heavy','motion','fast'], vibe: ['bass-heavy','rhythmic','energetic'] },
      { label: 'Dark ambient', tags: ['dark','still'], vibe: ['dark','spacious','unsettling'] },
      { label: 'Darkwave', tags: ['dark','electronic','melancholy'], vibe: ['dark','electronic','melancholic'] },
      { label: 'Death metal', tags: ['intense','heavy'], vibe: ['extreme','heavy','intense'] },
      { label: 'Disco', tags: ['motion','bright','euphoric'], vibe: ['groove','bright','euphoric'] },
      { label: 'Doom metal', tags: ['heavy','slow','dark'], vibe: ['heavy','slow','ominous'] },
      { label: 'Dream pop', tags: ['hypnotic','light'], vibe: ['hazy','melodic','dreamy'] },
      { label: 'Drum & bass', tags: ['fast','heavy'], vibe: ['fast','bass-heavy','kinetic'] },
      { label: 'Dubstep', tags: ['heavy','intense','electronic'], vibe: ['bass-heavy','intense','electronic'] },
      { label: 'Dungeon synth', tags: ['retro','cinematic','dark'], vibe: ['medieval','atmospheric','dark'] },
      { label: 'EBM', tags: ['electronic','motion','intense'], vibe: ['industrial','rhythmic','aggressive'] },
      { label: 'Electro', tags: ['electronic','motion','modern'], vibe: ['synthetic','funky','futuristic'] },
      { label: 'Emo', tags: ['melancholy','intense'], vibe: ['vulnerable','intense','cathartic'] },
      { label: 'Flamenco', tags: ['intense','organic','motion'], vibe: ['passionate','acoustic','rhythmic'] },
      { label: 'Folk metal', tags: ['organic','heavy','cinematic'], vibe: ['folk','heavy','epic'] },
      { label: 'Folktronica', tags: ['organic','electronic','weird'], vibe: ['organic','electronic','exploratory'] },
      { label: 'Free jazz', tags: ['weird','organic','intense'], vibe: ['chaotic','improvisational','intense'] },
      { label: 'Futuristic funk', tags: ['electronic','motion','modern'], vibe: ['synthetic','funky','futuristic'] },
      { label: 'Garage rock', tags: ['raw','fast'], vibe: ['raw','rebellious','energetic'] },
      { label: 'Glam rock', tags: ['cinematic','polished','raw'], vibe: ['theatrical','flashy','rebellious'] },
      { label: 'Gospel', tags: ['warm','euphoric','intense'], vibe: ['soulful','euphoric','powerful'] },
      { label: 'Gothic rock', tags: ['dark','cinematic','melancholy'], vibe: ['dark','dramatic','melancholic'] },
      { label: 'Grime', tags: ['raw','motion'], vibe: ['urban','raw','rhythmic'] },
      { label: 'Hardcore punk', tags: ['intense','fast','raw'], vibe: ['aggressive','fast','raw'] },
      { label: 'Hard techno', tags: ['intense','heavy','hypnotic'], vibe: ['relentless','heavy','hypnotic'] },
      { label: 'House', tags: ['electronic','motion','social'], vibe: ['electronic','groove','social'] },
      { label: 'Hypnagogic pop', tags: ['hypnotic','retro','weird'], vibe: ['hazy','nostalgic','surreal'] },
      { label: 'IDM', tags: ['focus','electronic','weird'], vibe: ['intricate','synthetic','experimental'] },
      { label: 'Industrial', tags: ['electronic','raw','intense'], vibe: ['mechanical','abrasive','intense'] },
      { label: 'J-pop', tags: ['light','bright','polished'], vibe: ['melodic','bright','polished'] },
      { label: 'J-rock', tags: ['fast','light','raw'], vibe: ['energetic','melodic','raw'] },
      { label: 'Jungle', tags: ['motion','heavy','fast'], vibe: ['breakbeat','bass-heavy','kinetic'] },
      { label: 'K-pop', tags: ['polished','motion','euphoric'], vibe: ['polished','rhythmic','euphoric'] },
      { label: 'Krautrock', tags: ['hypnotic','weird'], vibe: ['motorik','hypnotic','experimental'] },
      { label: 'Library music', tags: ['cinematic','focus','weird'], vibe: ['cinematic','instrumental','exploratory'] },
      { label: 'Lo-fi', tags: ['calm','focus','warm'], vibe: ['calm','focus','warm'] },
      { label: 'Lowercase', tags: ['still','weird'], vibe: ['minimal','quiet','experimental'] },
      { label: 'Math rock', tags: ['focus','raw','fast'], vibe: ['intricate','angular','restless'] },
      { label: 'Minimal', tags: ['still','polished'], vibe: ['sparse','restrained','precise'] },
      { label: 'Musique concrète', tags: ['hypnotic','weird'], vibe: ['textural','experimental','abstract'] },
      { label: 'Neo-soul', tags: ['warm','polished','motion'], vibe: ['warm','sophisticated','groove'] },
      { label: 'New age', tags: ['calm','still','hypnotic'], vibe: ['tranquil','spacious','meditative'] },
      { label: 'New wave', tags: ['electronic','retro','raw'], vibe: ['electronic','retro','angular'] },
      { label: 'Noise', tags: ['raw','weird'], vibe: ['abrasive','chaotic','experimental'] },
      { label: 'Noise rock', tags: ['raw'], vibe: ['distorted','raw','dissonant'] },
      { label: 'Onkyo', tags: ['still','organic'], vibe: ['minimal','improvisational','spacious'] },
      { label: 'Opera', tags: ['cinematic','intense'], vibe: ['dramatic','theatrical','powerful'] },
      { label: 'Outsider music', tags: ['weird','raw'], vibe: ['unconventional','raw','unpredictable'] },
      { label: 'Post-hardcore', tags: ['intense'], vibe: ['intense','dynamic','cathartic'] },
      { label: 'Post-metal', tags: ['heavy','cinematic'], vibe: ['heavy','atmospheric','expansive'] },
      { label: 'Post-punk', tags: ['raw','dark','fast'], vibe: ['angular','dark','restless'] },
      { label: 'Post-rock', tags: ['cinematic','focus'], vibe: ['cinematic','expansive','instrumental'] },
      { label: 'Power pop', tags: ['light','bright','fast'], vibe: ['melodic','bright','energetic'] },
      { label: 'Progressive metal', tags: ['focus','heavy','cinematic'], vibe: ['technical','heavy','expansive'] },
      { label: 'Progressive rock', tags: ['focus','cinematic'], vibe: ['intricate','expansive','dramatic'] },
      { label: 'Psychedelic rock', tags: ['hypnotic','organic','cinematic'], vibe: ['trippy','organic','expansive'] },
      { label: 'Psychedelic', tags: ['hypnotic'], vibe: ['trippy','fluid','hypnotic'] },
      { label: 'Ragtime', tags: ['motion','light','organic'], vibe: ['syncopated','playful','acoustic'] },
      { label: 'Rai', tags: ['motion','warm','modern'], vibe: ['rhythmic','expressive','modern'] },
      { label: 'Riot grrrl', tags: ['raw'], vibe: ['rebellious','raw','feminist'] },
      { label: 'Rockabilly', tags: ['retro','raw','fast'], vibe: ['retro','rebellious','lively'] },
      { label: 'Salsa', tags: ['motion','social','fast'], vibe: ['rhythmic','social','energetic'] },
      { label: 'Samba', tags: ['motion','bright','euphoric'], vibe: ['rhythmic','bright','celebratory'] },
      { label: 'Screamo', tags: ['raw','melancholy','intense'], vibe: ['raw','emotional','explosive'] },
      { label: 'Ska', tags: ['fast','motion','light'], vibe: ['upbeat','rhythmic','playful'] },
      { label: 'Skweee', tags: ['light','electronic','weird'], vibe: ['playful','synthetic','wonky'] },
      { label: 'Sludge metal', tags: ['heavy','raw'], vibe: ['gritty','heavy','abrasive'] },
      { label: 'Soft rock', tags: ['light','warm'], vibe: ['melodic','warm','easygoing'] },
      { label: 'Spiritual jazz', tags: ['cinematic','warm','euphoric'], vibe: ['expansive','soulful','transcendent'] },
      { label: 'Spoken word', tags: ['solo','warm'], vibe: ['lyrical','intimate','expressive'] },
      { label: 'Stoner rock', tags: ['heavy','hypnotic'], vibe: ['fuzzy','heavy','hypnotic'] },
      { label: 'Swing', tags: ['light','motion','fast'], vibe: ['playful','rhythmic','lively'] },
      { label: 'Synth-pop', tags: ['electronic','light','retro'], vibe: ['synthetic','melodic','retro'] },
      { label: 'Techno', tags: ['electronic','motion','hypnotic'], vibe: ['electronic','driving','hypnotic'] },
      { label: 'Traditional Indian', tags: ['focus','light','hypnotic'], vibe: ['intricate','melodic','meditative'] },
      { label: 'Trip-hop', tags: ['slow','dark','cinematic'], vibe: ['downtempo','dark','atmospheric'] },
      { label: 'UK garage', tags: ['motion','heavy','light'], vibe: ['syncopated','bass-heavy','playful'] },
      { label: 'Vaporwave', tags: ['retro','electronic','hypnotic'], vibe: ['nostalgic','synthetic','hazy'] },
      { label: 'Witch house', tags: ['dark','raw'], vibe: ['dark','distorted','occult'] },
      { label: 'World fusion', tags: ['organic','weird','motion'], vibe: ['cross-cultural','exploratory','rhythmic'] },
      { label: 'Zeuhl', tags: ['motion','cinematic','weird'], vibe: ['rhythmic','theatrical','progressive'] },
      { label: 'Zydeco', tags: ['motion','fast','organic'], vibe: ['rhythmic','lively','accordion-driven'] }
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
      { label: 'Emerging artists', tags: ['modern','raw'], vibe: ['modern','independent','promising'],
        line: 'Newer or growing artists, regardless of view counts.' },
      { label: 'Under-discovered artists', tags: ['raw','weird','modern'], vibe: ['overlooked','distinctive','fresh'],
        line: 'Artists with worthwhile music who deserve a bigger audience.' },
      { label: 'Deep cuts', tags: ['weird','raw','solo'], vibe: ['unexpected','authentic','personal'],
        line: 'Less obvious tracks, B-sides, album tracks and unexpected selections from artists who may already be famous.' },
      { label: 'Rabbit hole', tags: ['hypnotic','weird'], vibe: ['hypnotic','weird','exploratory'],
        line: 'Follow musical connections deeper and deeper, including obscure scenes and surprising influences.' },
      { label: 'Surprise me', tags: ['weird','light'], vibe: ['unpredictable','adventurous','open'],
        line: 'Give the DJ maximum freedom to make unexpected choices.' },
      { label: 'Take me somewhere new', tags: ['weird'], vibe: ['unfamiliar','exploratory','curious'],
        line: 'Prioritise sounds, artists or scenes the listener is unlikely to know.' },
      { label: 'Cult favourites', tags: ['warm','weird','retro'], vibe: ['devoted','distinctive','influential'],
        line: 'Beloved within smaller, dedicated communities but not necessarily mainstream.' },
      { label: 'Forgotten gems', tags: ['retro','raw'], vibe: ['nostalgic','overlooked','timeless'],
        line: 'Older recordings that deserve another listen.' },
      { label: 'Local scenes', tags: ['organic','raw'], vibe: ['regional','independent','authentic'],
        line: 'Explore artists connected to particular cities, countries or music communities.' },
      { label: 'Beyond the obvious', tags: ['weird'], vibe: ['adventurous','unexpected','eclectic'],
        line: 'Avoid the predictable first choices and look for more interesting alternatives.' },
      { label: 'Don\'t care', tags: [], vibe: [],
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
    options: [
      { label: 'Broship Radio', tags: ['social','warm','raw'], vibe: ['social','warm','raw'],
        line: 'You are Broship Radio. Like a mate with suspiciously good taste and an aux cable.', blurb: 'Like a mate with suspiciously good taste and an aux cable.' },
      { label: 'The Basement Dweller', tags: ['raw','night'], vibe: ['raw','underground','nocturnal'],
        line: 'You are The Basement Dweller. Straight from the sweaty basement nobody told you about.', blurb: 'Straight from the sweaty basement nobody told you about.' },
      { label: 'The Beautiful Disaster', tags: ['weird','melancholy'], vibe: ['chaotic','emotional','unpredictable'],
        line: 'You are The Beautiful Disaster. Terrible decisions. Perfect soundtrack.', blurb: 'Terrible decisions. Perfect soundtrack.' },
      { label: 'The Cool Aunt / Uncle', tags: ['weird','polished','warm'], vibe: ['eclectic','confident','soulful'],
        line: 'You are The Cool Aunt / Uncle. Has been into your favourite band since before you were born.', blurb: 'Has been into your favourite band since before you were born.' },
      { label: 'The Contrarian', tags: ['raw','weird'], vibe: ['rebellious','unexpected','provocative'],
        line: 'You are The Contrarian. If it\'s obvious, it\'s probably not getting played.', blurb: 'If it\'s obvious, it\'s probably not getting played.' },
      { label: 'The Crate Digger', tags: ['hypnotic','weird','raw'], vibe: ['obsessive','curious','authentic'],
        line: 'You are The Crate Digger. Digging through the musical underground to find your next obsession.', blurb: 'Digging through the musical underground to find your next obsession.' },
      { label: 'Don\'t Ask, Just Listen', tags: ['dark','polished'], vibe: ['mysterious','confident','dark'],
        line: 'You are Don\'t Ask, Just Listen. No explanations. No apologies. Just trust the selection.', blurb: 'No explanations. No apologies. Just trust the selection.' },
      { label: 'The Futurist', tags: ['electronic','weird','modern'], vibe: ['synthetic','adventurous','forward-looking'],
        line: 'You are The Futurist. Broadcasting from five years into the musical future.', blurb: 'Broadcasting from five years into the musical future.' },
      { label: 'The Happy Accident', tags: ['light','warm','weird'], vibe: ['playful','warm','unpredictable'],
        line: 'You are The Happy Accident. One wrong turn away from your new favourite track.', blurb: 'One wrong turn away from your new favourite track.' },
      { label: 'The Heartbreaker', tags: ['melancholy','cinematic','intense'], vibe: ['bittersweet','dramatic','cathartic'],
        line: 'You are The Heartbreaker. For falling in love, falling apart and dancing through the wreckage.', blurb: 'For falling in love, falling apart and dancing through the wreckage.' },
      { label: 'The Insomniac', tags: ['night','hypnotic','solo'], vibe: ['nocturnal','hazy','introspective'],
        line: 'You are The Insomniac. For the hours when the rest of the world has switched off.', blurb: 'For the hours when the rest of the world has switched off.' },
      { label: 'The Last DJ on Earth', tags: ['dark','cinematic'], vibe: ['apocalyptic','cinematic','dramatic'],
        line: 'You are The Last DJ on Earth. One final broadcast before the lights go out.', blurb: 'One final broadcast before the lights go out.' },
      { label: 'The Music Snob', tags: ['polished','weird'], vibe: ['discerning','obscure','confident'],
        line: 'You are The Music Snob. Your taste isn\'t bad. It just needs more obscure records.', blurb: 'Your taste isn\'t bad. It just needs more obscure records.' },
      { label: 'Musical Mischief', tags: ['weird','social','fast'], vibe: ['weird','social','fast'],
        line: 'You are Musical Mischief. Here to cause trouble in your carefully organised music library.', blurb: 'Here to cause trouble in your carefully organised music library.' },
      { label: 'The One-Track Obsession', tags: ['focus','hypnotic'], vibe: ['focused','hypnotic','obsessive'],
        line: 'You are The One-Track Obsession. One sound. One obsession. No idea when we\'re coming back.', blurb: 'One sound. One obsession. No idea when we\'re coming back.' },
      { label: 'The Party Philosopher', tags: ['light','still','euphoric'], vibe: ['playful','thoughtful','euphoric'],
        line: 'You are The Party Philosopher. Making you dance while quietly questioning your existence.', blurb: 'Making you dance while quietly questioning your existence.' },
      { label: 'The Rabbit Hole', tags: ['hypnotic','weird'], vibe: ['hypnotic','curious','immersive'],
        line: 'You are The Rabbit Hole. One track leads to another. Suddenly it\'s 3 AM.', blurb: 'One track leads to another. Suddenly it\'s 3 AM.' },
      { label: 'The Romantic', tags: ['warm','melancholy'], vibe: ['intimate','warm','emotional'],
        line: 'You are The Romantic. Every song means something. Even the ones that shouldn\'t.', blurb: 'Every song means something. Even the ones that shouldn\'t.' },
      { label: 'The Scenic Route', tags: ['slow','cinematic'], vibe: ['patient','cinematic','expansive'],
        line: 'You are The Scenic Route. No shortcuts. The journey is the whole point.', blurb: 'No shortcuts. The journey is the whole point.' },
      { label: 'The Sonic Archaeologist', tags: ['retro','weird'], vibe: ['historical','curious','exploratory'],
        line: 'You are The Sonic Archaeologist. Uncovering the strange origins of sounds you thought you knew.', blurb: 'Uncovering the strange origins of sounds you thought you knew.' },
      { label: 'The Strange Machine', tags: ['electronic','weird','cold'], vibe: ['mechanical','weird','cold'],
        line: 'You are The Strange Machine. An unusual machine with impeccable musical instincts.', blurb: 'An unusual machine with impeccable musical instincts.' },
      { label: 'Strange but Good', tags: ['weird','warm','light'], vibe: ['weird','warm','playful'],
        line: 'You are Strange but Good. Sounds wrong for ten seconds. Then it makes perfect sense.', blurb: 'Sounds wrong for ten seconds. Then it makes perfect sense.' },
      { label: 'Suspiciously Good', tags: ['polished','bright'], vibe: ['polished','confident','bright'],
        line: 'You are Suspiciously Good. Every track belongs. Every transition feels inevitable.', blurb: 'Every track belongs. Every transition feels inevitable.' },
      { label: 'The Time Traveller', tags: ['retro','weird'], vibe: ['nostalgic','curious','eclectic'],
        line: 'You are The Time Traveller. Connecting musical dots across decades and alternate timelines.', blurb: 'Connecting musical dots across decades and alternate timelines.' },
      { label: 'The Underground Evangelist', tags: ['intense','raw'], vibe: ['passionate','raw','independent'],
        line: 'You are The Underground Evangelist. Spreading the good word about bands the world hasn\'t caught up with.', blurb: 'Spreading the good word about bands the world hasn\'t caught up with.' },
      { label: 'The Unreliable Narrator', tags: ['dark','light','weird'], vibe: ['mysterious','playful','unpredictable'],
        line: 'You are The Unreliable Narrator. You might not understand the journey until the final track.', blurb: 'You might not understand the journey until the final track.' },
      { label: 'The Wildcard', tags: ['weird','intense','fast'], vibe: ['unpredictable','bold','restless'],
        line: 'You are The Wildcard. No one knows what\'s coming next. Least of all you.', blurb: 'No one knows what\'s coming next. Least of all you.' },
      { label: 'Where Did This Come From?', tags: ['weird'], vibe: ['curious','weird','adventurous'],
        line: 'You are Where Did This Come From?. Taking the scenic route through music you never knew existed.', blurb: 'Taking the scenic route through music you never knew existed.' },
      { label: 'The Accidental Genius', tags: ['light','weird'], vibe: ['playful','eclectic','open'],
        line: 'You are The Accidental Genius. No master plan. Just an extraordinary run of happy accidents.', blurb: 'No master plan. Just an extraordinary run of happy accidents.' },
      { label: 'The Anti-Algorithm', tags: ['raw','weird'], vibe: ['rebellious','eclectic','unpredictable'],
        line: 'You are The Anti-Algorithm. Forget what you like. Discover what you could love.', blurb: 'Forget what you like. Discover what you could love.' },
      { label: 'Wrong Turn Radio', tags: ['weird','motion'], vibe: ['weird','motion','adventurous'],
        line: 'You are Wrong Turn Radio. Every wrong turn takes you somewhere worth hearing.', blurb: 'Every wrong turn takes you somewhere worth hearing.' },
      { label: 'The Chaos Theorist', tags: ['fast','weird'], vibe: ['restless','strange','experimental'],
        line: 'You are The Chaos Theorist. Finding beautiful patterns in gloriously unpredictable noise.', blurb: 'Finding beautiful patterns in gloriously unpredictable noise.' }
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
     2. DJ_LINK_HUNTER_PROMPT — Link Hunter. riffrolled builds it from the
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

- Emerging artists: newer or growing artists, regardless of view counts. Do not assume every new release is worthwhile.
- Under-discovered artists: artists with worthwhile music who deserve a bigger audience.
- Deep cuts: less obvious tracks, B-sides, album tracks and unexpected selections from artists who may already be famous.
- Rabbit hole: follow musical connections deeper and deeper, including obscure scenes and surprising influences. Let one discovery lead naturally to another.
- Surprise me: give the DJ maximum freedom to make unexpected choices. Take creative risks and avoid predictable choices.
- Take me somewhere new: prioritise sounds, artists or scenes the listener is unlikely to know.
- Cult favourites: music beloved within smaller, dedicated communities but not necessarily mainstream.
- Forgotten gems: older recordings that deserve another listen.
- Local scenes: explore artists connected to particular cities, countries or music communities.
- Beyond the obvious: avoid the predictable first choices and look for more interesting alternatives.
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

var DJ_LINK_HUNTER_PROMPT = `LINK HUNTER

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
