/* riffrolled — music-styles.js
   The styles Simple mode's search offers: a few hundred names people
   actually use, each with the broad genre it belongs to on riffrolled's
   closed list (genres.js). The search is rich; the catalogue stays tidy.

   [style, broad genre]. Add freely — the broad genre must be one of
   riffGenres.LIST (the selftest checks). Anything a listener types that
   isn't here can still be used as their own words. */
var MUSIC_STYLES = [
  // Electronic, broadly
  ['Electronic', 'Electronic'], ['EDM', 'Electronic'], ['Electro', 'Electronic'], ['Electroclash', 'Electronic'],
  ['Big beat', 'Electronic'], ['Breakbeat', 'Electronic'], ['Breaks', 'Electronic'], ['Nu skool breaks', 'Electronic'],
  ['Dubstep', 'Electronic'], ['Brostep', 'Electronic'], ['Riddim', 'Electronic'], ['Future bass', 'Electronic'],
  ['Trap (EDM)', 'Electronic'], ['Moombahton', 'Electronic'], ['Glitch hop', 'Electronic'], ['Electro swing', 'Electronic'],
  ['Hardstyle', 'Electronic'], ['Hardcore (techno)', 'Electronic'], ['Gabber', 'Electronic'], ['Happy hardcore', 'Electronic'],
  ['UK hardcore', 'Electronic'], ['Bassline', 'Electronic'], ['Footwork', 'Electronic'], ['Juke', 'Electronic'],
  ['Wonky', 'Electronic'], ['Folktronica', 'Electronic'], ['Indietronica', 'Electronic'], ['Nu disco', 'Electronic'],
  ['Eurodance', 'Electronic'], ['Hi-NRG', 'Electronic'], ['Electro house', 'Electronic'], ['Complextro', 'Electronic'],
  ['Big room', 'Electronic'], ['Melodic bass', 'Electronic'], ['Wave', 'Electronic'], ['Hyperpop', 'Pop'],
  ['Jersey club', 'Electronic'], ['Baltimore club', 'Electronic'], ['Amapiano', 'House'], ['Gqom', 'Electronic'],
  ['Kuduro', 'Electronic'], ['Baile funk', 'Electronic'], ['Funk carioca', 'Electronic'], ['Phonk', 'Hip-hop'],
  ['Drift phonk', 'Hip-hop'], ['Witch house', 'Electronic'], ['Chiptune', 'Electronic'], ['Bitpop', 'Electronic'],
  ['Video game music', 'Soundtrack'], ['Electro-industrial', 'Electronic'], ['EBM', 'Electronic'], ['Aggrotech', 'Electronic'],
  // House
  ['House', 'House'], ['Deep house', 'House'], ['Tech house', 'House'], ['Progressive house', 'House'],
  ['Acid house', 'House'], ['Chicago house', 'House'], ['Garage house', 'House'], ['Soulful house', 'House'],
  ['Disco house', 'House'], ['French house', 'House'], ['Filter house', 'House'], ['Afro house', 'House'],
  ['Organic house', 'House'], ['Melodic house', 'House'], ['Lo-fi house', 'House'], ['Microhouse', 'House'],
  ['Tropical house', 'House'], ['Future house', 'House'], ['Bass house', 'House'], ['Ghetto house', 'House'],
  ['Italo house', 'House'], ['Balearic', 'House'], ['Jackin house', 'House'], ['Funky house', 'House'],
  ['Hip house', 'House'], ['UK garage', 'House'], ['2-step', 'House'], ['Speed garage', 'House'], ['Afro tech', 'House'],
  // Techno
  ['Techno', 'Techno'], ['Detroit techno', 'Techno'], ['Minimal techno', 'Techno'], ['Dub techno', 'Techno'],
  ['Acid techno', 'Techno'], ['Hard techno', 'Techno'], ['Industrial techno', 'Techno'], ['Melodic techno', 'Techno'],
  ['Peak time techno', 'Techno'], ['Schranz', 'Techno'], ['Hypnotic techno', 'Techno'], ['Ambient techno', 'Techno'],
  ['Berlin techno', 'Techno'], ['Rave', 'Techno'], ['Hard dance', 'Techno'], ['Electro (Detroit)', 'Techno'],
  // Trance
  ['Trance', 'Trance'], ['Progressive trance', 'Trance'], ['Uplifting trance', 'Trance'], ['Psytrance', 'Trance'],
  ['Goa trance', 'Trance'], ['Full-on psytrance', 'Trance'], ['Dark psytrance', 'Trance'], ['Forest psytrance', 'Trance'],
  ['Hi-tech psytrance', 'Trance'], ['Progressive psytrance', 'Trance'], ['Tech trance', 'Trance'], ['Vocal trance', 'Trance'],
  ['Hard trance', 'Trance'], ['Acid trance', 'Trance'], ['Dream trance', 'Trance'], ['Balearic trance', 'Trance'],
  ['Psybient', 'Trance'], ['Psydub', 'Trance'],
  // Drum & bass
  ['Drum & bass', 'Drum & Bass'], ['Liquid drum & bass', 'Drum & Bass'], ['Neurofunk', 'Drum & Bass'], ['Jump-up', 'Drum & Bass'],
  ['Jungle', 'Drum & Bass'], ['Ragga jungle', 'Drum & Bass'], ['Atmospheric drum & bass', 'Drum & Bass'], ['Techstep', 'Drum & Bass'],
  ['Darkstep', 'Drum & Bass'], ['Halftime', 'Drum & Bass'], ['Minimal drum & bass', 'Drum & Bass'], ['Drumfunk', 'Drum & Bass'],
  // Synthwave & co
  ['Synthwave', 'Synthwave'], ['Retrowave', 'Synthwave'], ['Outrun', 'Synthwave'], ['Darksynth', 'Synthwave'],
  ['Vaporwave', 'Synthwave'], ['Chillwave', 'Synthwave'], ['Future funk', 'Synthwave'], ['Dreamwave', 'Synthwave'],
  ['Spacesynth', 'Synthwave'], ['Mallsoft', 'Synthwave'],
  // Ambient, downtempo, lo-fi, trip-hop
  ['Ambient', 'Ambient'], ['Dark ambient', 'Ambient'], ['Drone', 'Ambient'], ['Space ambient', 'Ambient'],
  ['Ambient pop', 'Ambient'], ['New age', 'Ambient'], ['Field recordings', 'Ambient'], ['Isolationism', 'Ambient'],
  ['Lowercase', 'Ambient'], ['Ambient dub', 'Ambient'], ['Sleep music', 'Ambient'], ['Meditation', 'Ambient'],
  ['Downtempo', 'Downtempo'], ['Chillout', 'Downtempo'], ['Lounge', 'Downtempo'], ['Nu jazz', 'Downtempo'],
  ['Chillstep', 'Downtempo'], ['Organic downtempo', 'Downtempo'], ['Café del Mar', 'Downtempo'], ['Sunset chill', 'Downtempo'],
  ['Lo-fi', 'Lo-fi'], ['Lo-fi hip hop', 'Lo-fi'], ['Chillhop', 'Lo-fi'], ['Jazzhop', 'Lo-fi'], ['Lo-fi beats to study', 'Lo-fi'],
  ['Bedroom pop', 'Lo-fi'], ['Trip-hop', 'Trip-hop'], ['Bristol sound', 'Trip-hop'], ['Abstract hip hop', 'Trip-hop'],
  // Hip-hop
  ['Hip-hop', 'Hip-hop'], ['Rap', 'Hip-hop'], ['Boom bap', 'Hip-hop'], ['Golden age hip hop', 'Hip-hop'],
  ['East Coast hip hop', 'Hip-hop'], ['West Coast hip hop', 'Hip-hop'], ['G-funk', 'Hip-hop'], ['Southern hip hop', 'Hip-hop'],
  ['Trap', 'Hip-hop'], ['Drill', 'Hip-hop'], ['UK drill', 'Hip-hop'], ['Grime', 'Hip-hop'], ['UK hip hop', 'Hip-hop'],
  ['Cloud rap', 'Hip-hop'], ['Conscious hip hop', 'Hip-hop'], ['Jazz rap', 'Hip-hop'], ['Alternative hip hop', 'Hip-hop'],
  ['Underground hip hop', 'Hip-hop'], ['Experimental hip hop', 'Experimental'], ['Horrorcore', 'Hip-hop'], ['Crunk', 'Hip-hop'],
  ['Emo rap', 'Hip-hop'], ['Rage', 'Hip-hop'], ['Plugg', 'Hip-hop'], ['French rap', 'Hip-hop'], ['German rap', 'Hip-hop'],
  ['Instrumental hip hop', 'Hip-hop'], ['Turntablism', 'Hip-hop'], ['Old school hip hop', 'Hip-hop'],
  // R&B / soul
  ['R&B', 'R&B / Soul'], ['Contemporary R&B', 'R&B / Soul'], ['Alternative R&B', 'R&B / Soul'], ['Neo-soul', 'R&B / Soul'],
  ['Soul', 'R&B / Soul'], ['Northern soul', 'R&B / Soul'], ['Southern soul', 'R&B / Soul'], ['Motown', 'R&B / Soul'],
  ['Philly soul', 'R&B / Soul'], ['Psychedelic soul', 'R&B / Soul'], ['Quiet storm', 'R&B / Soul'], ['New jack swing', 'R&B / Soul'],
  ['Gospel', 'R&B / Soul'], ['Doo-wop', 'R&B / Soul'], ['Rhythm and blues', 'R&B / Soul'],
  // Funk / disco
  ['Funk', 'Funk / Disco'], ['P-funk', 'Funk / Disco'], ['Jazz-funk', 'Funk / Disco'], ['Afro-funk', 'Funk / Disco'],
  ['Boogie', 'Funk / Disco'], ['Disco', 'Funk / Disco'], ['Italo disco', 'Funk / Disco'], ['Space disco', 'Funk / Disco'],
  ['Cosmic disco', 'Funk / Disco'], ['Post-disco', 'Funk / Disco'], ['Electro-funk', 'Funk / Disco'], ['Minneapolis sound', 'Funk / Disco'],
  ['Go-go', 'Funk / Disco'],
  // Jazz
  ['Jazz', 'Jazz'], ['Bebop', 'Jazz'], ['Hard bop', 'Jazz'], ['Cool jazz', 'Jazz'], ['Modal jazz', 'Jazz'],
  ['Free jazz', 'Jazz'], ['Spiritual jazz', 'Jazz'], ['Jazz fusion', 'Jazz'], ['Smooth jazz', 'Jazz'], ['Swing', 'Jazz'],
  ['Big band', 'Jazz'], ['Gypsy jazz', 'Jazz'], ['Latin jazz', 'Jazz'], ['Bossa nova', 'Latin'], ['Vocal jazz', 'Jazz'],
  ['Acid jazz', 'Jazz'], ['UK jazz', 'Jazz'], ['Ethio-jazz', 'Jazz'], ['Dark jazz', 'Jazz'], ['Jazz piano', 'Jazz'],
  ['Dixieland', 'Jazz'], ['Ragtime', 'Jazz'], ['ECM jazz', 'Jazz'], ['Post-bop', 'Jazz'],
  // Classical & soundtrack
  ['Classical', 'Classical'], ['Baroque', 'Classical'], ['Romantic era', 'Classical'], ['Opera', 'Classical'],
  ['Chamber music', 'Classical'], ['Choral', 'Classical'], ['Minimalism (classical)', 'Classical'], ['Contemporary classical', 'Classical'],
  ['Neoclassical', 'Classical'], ['Modern classical', 'Classical'], ['Solo piano', 'Classical'], ['String quartets', 'Classical'],
  ['Early music', 'Classical'], ['Symphonic', 'Classical'], ['Impressionist', 'Classical'],
  ['Soundtrack', 'Soundtrack'], ['Film score', 'Soundtrack'], ['Cinematic', 'Soundtrack'], ['Epic orchestral', 'Soundtrack'],
  ['Anime soundtrack', 'Soundtrack'], ['Musicals', 'Soundtrack'], ['Library music', 'Soundtrack'], ['Spaghetti western', 'Soundtrack'],
  ['Horror soundtrack', 'Soundtrack'], ['TV themes', 'Soundtrack'],
  // Folk, country, blues
  ['Folk', 'Folk'], ['Indie folk', 'Folk'], ['Freak folk', 'Folk'], ['Psychedelic folk', 'Folk'], ['British folk', 'Folk'],
  ['American folk', 'Folk'], ['Contemporary folk', 'Folk'], ['Folk rock', 'Folk'], ['Singer-songwriter', 'Folk'],
  ['Acoustic', 'Folk'], ['Celtic', 'Folk'], ['Anti-folk', 'Folk'], ['Chamber folk', 'Folk'], ['Neofolk', 'Folk'],
  ['Country', 'Country'], ['Americana', 'Country'], ['Alt-country', 'Country'], ['Outlaw country', 'Country'],
  ['Bluegrass', 'Country'], ['Honky-tonk', 'Country'], ['Country pop', 'Country'], ['Western swing', 'Country'],
  ['Cosmic country', 'Country'], ['Red dirt', 'Country'],
  ['Blues', 'Blues'], ['Delta blues', 'Blues'], ['Chicago blues', 'Blues'], ['Electric blues', 'Blues'],
  ['Blues rock', 'Blues'], ['Desert blues', 'Blues'], ['Soul blues', 'Blues'], ['Texas blues', 'Blues'], ['Piedmont blues', 'Blues'],
  // Rock
  ['Rock', 'Rock'], ['Classic rock', 'Rock'], ['Hard rock', 'Rock'], ['Psychedelic rock', 'Rock'], ['Progressive rock', 'Rock'],
  ['Krautrock', 'Rock'], ['Garage rock', 'Rock'], ['Glam rock', 'Rock'], ['Surf rock', 'Rock'], ['Stoner rock', 'Rock'],
  ['Desert rock', 'Rock'], ['Southern rock', 'Rock'], ['Roots rock', 'Rock'], ['Heartland rock', 'Rock'], ['Space rock', 'Rock'],
  ['Art rock', 'Rock'], ['Rock and roll', 'Rock'], ['Rockabilly', 'Rock'], ['Soft rock', 'Rock'], ['Yacht rock', 'Rock'],
  ['Power pop', 'Rock'], ['Jam band', 'Rock'], ['Math rock', 'Rock'], ['Noise rock', 'Rock'], ['Post-rock', 'Rock'],
  ['Instrumental rock', 'Rock'], ['Arena rock', 'Rock'], ['Britpop', 'Indie'], ['Madchester', 'Indie'], ['Baggy', 'Indie'],
  // Indie / alternative
  ['Indie', 'Indie'], ['Indie rock', 'Indie'], ['Indie pop', 'Indie'], ['Twee pop', 'Indie'], ['Jangle pop', 'Indie'],
  ['C86', 'Indie'], ['Slacker rock', 'Indie'], ['Lo-fi indie', 'Indie'], ['Midwest emo', 'Indie'], ['Chamber pop', 'Indie'],
  ['Baroque pop', 'Indie'], ['Art pop', 'Indie'], ['Sophisti-pop', 'Indie'],
  ['Alternative', 'Alternative'], ['Alternative rock', 'Alternative'], ['Grunge', 'Alternative'], ['Post-grunge', 'Alternative'],
  ['College rock', 'Alternative'], ['Nu metal', 'Metal'], ['Industrial rock', 'Alternative'], ['Trip rock', 'Alternative'],
  ['Emo', 'Alternative'], ['Post-hardcore', 'Alternative'], ['Screamo', 'Alternative'], ['Riot grrrl', 'Punk'],
  // Post-punk & goth
  ['Post-punk', 'Post-punk'], ['Darkwave', 'Post-punk'], ['Coldwave', 'Post-punk'], ['Gothic rock', 'Post-punk'],
  ['Deathrock', 'Post-punk'], ['No wave', 'Post-punk'], ['Post-punk revival', 'Post-punk'], ['Minimal wave', 'Post-punk'],
  ['Ethereal wave', 'Post-punk'], ['Neue Deutsche Welle', 'Post-punk'],
  // Punk
  ['Punk', 'Punk'], ['Punk rock', 'Punk'], ['Hardcore punk', 'Punk'], ['Pop punk', 'Punk'], ['Skate punk', 'Punk'],
  ['Crust punk', 'Punk'], ['Street punk', 'Punk'], ['Oi!', 'Punk'], ['Ska punk', 'Punk'], ['Folk punk', 'Punk'],
  ['Garage punk', 'Punk'], ['Anarcho-punk', 'Punk'], ['Egg punk', 'Punk'], ['Post-hardcore (punk)', 'Punk'],
  // Metal
  ['Metal', 'Metal'], ['Heavy metal', 'Metal'], ['Thrash metal', 'Metal'], ['Death metal', 'Metal'], ['Black metal', 'Metal'],
  ['Doom metal', 'Metal'], ['Sludge metal', 'Metal'], ['Stoner metal', 'Metal'], ['Power metal', 'Metal'], ['Progressive metal', 'Metal'],
  ['Metalcore', 'Metal'], ['Deathcore', 'Metal'], ['Djent', 'Metal'], ['Post-metal', 'Metal'], ['Folk metal', 'Metal'],
  ['Symphonic metal', 'Metal'], ['Gothic metal', 'Metal'], ['Industrial metal', 'Metal'], ['Grindcore', 'Metal'],
  ['Speed metal', 'Metal'], ['NWOBHM', 'Metal'], ['Atmospheric black metal', 'Metal'], ['Blackgaze', 'Metal'], ['Drone metal', 'Metal'],
  // Shoegaze / dream pop
  ['Shoegaze', 'Shoegaze / Dream pop'], ['Dream pop', 'Shoegaze / Dream pop'], ['Slowcore', 'Shoegaze / Dream pop'],
  ['Nu-gaze', 'Shoegaze / Dream pop'], ['Ethereal', 'Shoegaze / Dream pop'], ['Sadcore', 'Shoegaze / Dream pop'],
  // Pop
  ['Pop', 'Pop'], ['Dance pop', 'Pop'], ['Electropop', 'Synth-pop'], ['Teen pop', 'Pop'], ['Bubblegum pop', 'Pop'],
  ['Pop rock', 'Pop'], ['Adult contemporary', 'Pop'], ['K-pop', 'Pop'], ['J-pop', 'Pop'], ['C-pop', 'Pop'], ['Mandopop', 'Pop'],
  ['City pop', 'Pop'], ['Shibuya-kei', 'Pop'], ['Europop', 'Pop'], ['Schlager', 'Pop'], ['Yé-yé', 'Pop'], ['Chanson', 'Pop'],
  ['Sunshine pop', 'Pop'], ['Psychedelic pop', 'Pop'], ['Girl groups', 'Pop'], ['Boy bands', 'Pop'], ['Pop ballads', 'Pop'],
  ['Hyperpop (glitch)', 'Pop'], ['PC music', 'Pop'], ['Bedroom pop (indie)', 'Pop'],
  // Synth-pop
  ['Synth-pop', 'Synth-pop'], ['New wave', 'Synth-pop'], ['New romantic', 'Synth-pop'], ['Futurepop', 'Synth-pop'],
  ['Minimal synth', 'Synth-pop'], ['Italo pop', 'Synth-pop'],
  // Reggae / dub
  ['Reggae', 'Reggae / Dub'], ['Roots reggae', 'Reggae / Dub'], ['Dub', 'Reggae / Dub'], ['Dancehall', 'Reggae / Dub'],
  ['Ska', 'Reggae / Dub'], ['Rocksteady', 'Reggae / Dub'], ['Lovers rock', 'Reggae / Dub'], ['Ragga', 'Reggae / Dub'],
  ['Dub poetry', 'Reggae / Dub'], ['Digital dub', 'Reggae / Dub'], ['Steppers', 'Reggae / Dub'], ['2 Tone', 'Reggae / Dub'],
  ['Reggae fusion', 'Reggae / Dub'],
  // Latin
  ['Latin', 'Latin'], ['Salsa', 'Latin'], ['Cumbia', 'Latin'], ['Reggaeton', 'Latin'], ['Bachata', 'Latin'], ['Merengue', 'Latin'],
  ['Samba', 'Latin'], ['MPB', 'Latin'], ['Tropicália', 'Latin'], ['Tango', 'Latin'], ['Nuevo tango', 'Latin'], ['Mambo', 'Latin'],
  ['Son cubano', 'Latin'], ['Boogaloo', 'Latin'], ['Latin rock', 'Latin'], ['Latin pop', 'Latin'], ['Dembow', 'Latin'],
  ['Corridos', 'Latin'], ['Mariachi', 'Latin'], ['Norteño', 'Latin'], ['Flamenco', 'Latin'], ['Nueva canción', 'Latin'],
  ['Forró', 'Latin'], ['Chicha', 'Latin'], ['Afro-Cuban', 'Latin'], ['Brazilian funk', 'Latin'], ['Latin trap', 'Latin'],
  // World
  ['World', 'World'], ['Afrobeat', 'World'], ['Afrobeats', 'World'], ['Highlife', 'World'], ['Soukous', 'World'],
  ['Mbalax', 'World'], ['Juju', 'World'], ['Afro-pop', 'World'], ['Ethiopian', 'World'], ['Malian blues', 'World'],
  ['Rai', 'World'], ['Gnawa', 'World'], ['Arabic pop', 'World'], ['Turkish psych', 'World'], ['Anatolian rock', 'World'],
  ['Bollywood', 'World'], ['Indian classical', 'World'], ['Qawwali', 'World'], ['Bhangra', 'World'], ['Carnatic', 'World'],
  ['Gamelan', 'World'], ['Balkan brass', 'World'], ['Klezmer', 'World'], ['Fado', 'World'], ['Celtic (traditional)', 'World'],
  ['Nordic folk', 'World'], ['Throat singing', 'World'], ['Enka', 'World'], ['Thai pop', 'World'], ['Luk thung', 'World'],
  ['Mor lam', 'World'], ['Cambodian rock', 'World'], ['K-indie', 'World'], ['Zouk', 'World'], ['Kompa', 'World'],
  ['Calypso', 'World'], ['Soca', 'World'], ['Hawaiian', 'World'], ['Polka', 'World'], ['Sega', 'World'],
  ['Maloya', 'World'], ['Tuareg rock', 'World'], ['Amapiano (SA)', 'World'], ['Kwaito', 'World'], ['Township jive', 'World'],
  ['World fusion', 'World'], ['Ethno-jazz', 'World'],
  // Experimental
  ['Experimental', 'Experimental'], ['IDM', 'Experimental'], ['Glitch', 'Experimental'], ['Noise', 'Experimental'],
  ['Harsh noise', 'Experimental'], ['Musique concrète', 'Experimental'], ['Avant-garde', 'Experimental'], ['Sound art', 'Experimental'],
  ['Deconstructed club', 'Experimental'], ['Microsound', 'Experimental'], ['Plunderphonics', 'Experimental'], ['Hauntology', 'Experimental'],
  ['Industrial', 'Experimental'], ['Power electronics', 'Experimental'], ['Free improvisation', 'Experimental'], ['Tape music', 'Experimental'],
  ['Outsider music', 'Experimental'], ['Spoken word', 'Experimental'], ['Breakcore', 'Experimental'], ['Dungeon synth', 'Experimental'],
  ['Onkyo', 'Experimental'], ['Zeuhl', 'Experimental'], ['Avant-prog', 'Experimental'], ['Electroacoustic', 'Experimental']
];

/* The search: whole-word starts first, then anywhere; ties go to the
   shorter name (the more general style). */
var musicStyles = {
  _norm: function(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9& ]+/g, ' ').replace(/\s+/g, ' ').trim(); },

  search: function(q, limit){
    var n = this._norm(q);
    if (!n) return [];
    var self = this, out = [];
    MUSIC_STYLES.forEach(function(s){
      var name = self._norm(s[0]), genre = self._norm(s[1]), score = -1;
      if (name === n) score = 0;
      else if (name.indexOf(n) === 0) score = 1;
      else if ((' ' + name).indexOf(' ' + n) >= 0) score = 2;
      else if (name.replace(/ /g, '').indexOf(n.replace(/ /g, '')) >= 0) score = 3;
      else if (genre.indexOf(n) === 0) score = 4;          // "metal" also shows every kind of metal
      if (score >= 0) out.push({ name: s[0], genre: s[1], score: score });
    });
    out.sort(function(a, b){ return a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name); });
    return out.slice(0, limit || 8);
  },

  /** the broad genre for a style name, or for the listener's own words (via genres.js), or '' */
  genreOf: function(name){
    var n = this._norm(name);
    var hit = MUSIC_STYLES.find(function(s){ return musicStyles._norm(s[0]) === n; });
    if (hit) return hit[1];
    return (window.riffGenres ? riffGenres.normalize(name).genre : '') || '';
  }
};
