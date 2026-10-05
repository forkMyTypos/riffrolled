/* riffrolled — selftest.js
   In-browser tests against a throwaway database. Add #test to the URL. */

async function runSelfTests(){
  const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

  const tests = [
    ['createTrack dedupes by ytId', async () => {
      const a = await dbBoss.createTrack('aaaaaaaaaaa', 'A');
      const b = await dbBoss.createTrack('aaaaaaaaaaa', 'A again');
      assert(a === b, 'same ytId returns same id');
      assert((await db.tracks.count()) === 1, 'one track row');
    }],
    ['addToPlaylist dedupes + sequential order', async () => {
      const pl = await dbBoss.createPl('P');
      const t1 = await dbBoss.createTrack('t1111111111', 'T1');
      const t2 = await dbBoss.createTrack('t2222222222', 'T2');
      assert((await dbBoss.addToPlaylist(pl, t1)) === 'added');
      assert((await dbBoss.addToPlaylist(pl, t1)) === 'dupe', 'duplicate rejected');
      assert((await dbBoss.addToPlaylist(pl, t2)) === 'added');
      const j = await db.playlistTracks.where('playlistId').equals(pl).sortBy('order');
      assert(j.length === 2 && j[0].order === 0 && j[1].order === 1, 'orders 0,1');
    }],
    ['links: manual and automatic, direction kept', async () => {
      // PLAY_ORDER is directional and one row answers both questions
      assert((await dbBoss.link('PLAY_ORDER', 'aaaaaaaaaaa', 'bbbbbbbbbbb', {})) === 'added');
      assert((await dbBoss.link('PLAY_ORDER', 'aaaaaaaaaaa', 'bbbbbbbbbbb', {})) === 'strengthened');
      assert((await db.links.count()) === 1, 'one row, not two');
      const after = await dbBoss.linksFrom('PLAY_ORDER', 'aaaaaaaaaaa');
      assert(after.length === 1 && after[0].ytId === 'bbbbbbbbbbb' && after[0].score === 2, 'what follows a');
      const before = await dbBoss.linksTo('PLAY_ORDER', 'bbbbbbbbbbb');
      assert(before.length === 1 && before[0].ytId === 'aaaaaaaaaaa', 'what precedes b');
      assert((await dbBoss.linksFrom('PLAY_ORDER', 'bbbbbbbbbbb')).length === 0, 'b→a is a different thing');
      // the reverse direction is its own row
      await dbBoss.link('PLAY_ORDER', 'bbbbbbbbbbb', 'aaaaaaaaaaa', {});
      assert((await db.links.count()) === 2, 'b→a recorded separately');
      // RELATED is undirected: one row, readable from either end
      assert((await dbBoss.linkManual('ddddddddddd', 'ccccccccccc', 'wallet1')) === 'added');
      assert((await dbBoss.linkManual('ccccccccccc', 'ddddddddddd', 'wallet1')) === 'strengthened', 'reverse is the same link');
      assert((await dbBoss.linksFrom('RELATED', 'ccccccccccc'))[0].ytId === 'ddddddddddd', 'readable forwards');
      assert((await dbBoss.linksFrom('RELATED', 'ddddddddddd'))[0].ytId === 'ccccccccccc', 'and backwards');
      assert((await dbBoss.link('X', 'aaaaaaaaaaa', 'aaaaaaaaaaa', {})) === 'invalid', 'self-link rejected');
    }],
    ['links: a person claiming one riffrolled only observed', async () => {
      await dbBoss.link('RELATED', 'eeeeeeeeeee', 'fffffffffff', {});          // observed
      let row = await db.links.where('key').equals('RELATED:eeeeeeeeeee>fffffffffff').first();
      assert(row.origin === 'auto' && !row.createdBy, 'automatic links have no author');
      const r = await dbBoss.linkManual('eeeeeeeeeee', 'fffffffffff', 'wallet9');
      assert(r === 'claimed', 'a person can claim it');
      row = await db.links.where('key').equals('RELATED:eeeeeeeeeee>fffffffffff').first();
      assert(row.origin === 'manual' && row.createdBy === 'wallet9', 'and becomes its author');
      assert(row.count === 2, 'the evidence already gathered carries over');
    }],
    ['links: play order ignores skips and stale gaps', async () => {
      assert((await dbBoss.recordPair('aaaaaaaaaaa', 'bbbbbbbbbbb', { dwellMs: 3000 })) === 'skipped',
        'a three-second skip is not evidence they go together');
      assert((await db.links.count()) === 0, 'nothing written');
      assert((await dbBoss.recordPair('aaaaaaaaaaa', 'bbbbbbbbbbb', { dwellMs: 3 * 3600 * 1000 })) === 'skipped',
        'three hours later is a new session');
      assert((await dbBoss.recordPair('aaaaaaaaaaa', 'bbbbbbbbbbb', { dwellMs: 120000 })) === 'added',
        'two minutes of listening counts');
      const row = await db.links.where('key').equals('PLAY_ORDER:aaaaaaaaaaa>bbbbbbbbbbb').first();
      assert(row.origin === 'auto' && row.a === 'aaaaaaaaaaa' && row.b === 'bbbbbbbbbbb', 'auto, and in order');
      assert((await dbBoss.recordPair('aaaaaaaaaaa', 'aaaaaaaaaaa', { dwellMs: 120000 })) === 'skipped', 'self ignored');
    }],
    ['links: same-playlist is derived, never stored', async () => {
      const pl = await dbBoss.createPl('A set');
      const t1 = await dbBoss.createTrack('p1111111111', 'One');
      const t2 = await dbBoss.createTrack('p2222222222', 'Two');
      const t3 = await dbBoss.createTrack('p3333333333', 'Three');
      for (const t of [t1, t2, t3]) await dbBoss.addToPlaylist(pl, t);
      const near = await dbBoss.samePlaylist('p1111111111');
      assert(near.length === 2, 'the other two are its playlist neighbours');
      assert((await db.links.count()) === 0, 'and not one row was written for it');
      // a second shared playlist strengthens the pair
      const pl2 = await dbBoss.createPl('Another');
      await dbBoss.addToPlaylist(pl2, t1); await dbBoss.addToPlaylist(pl2, t2);
      const again = await dbBoss.samePlaylist('p1111111111');
      assert(again[0].ytId === 'p2222222222' && again[0].score === 2, 'two shared playlists outrank one');
      // removing the track removes the relationship: nothing to go stale
      await db.playlistTracks.where('playlistId').equals(pl2).delete();
      assert((await dbBoss.samePlaylist('p1111111111'))[0].score === 1, 'derived answers stay current');
    }],
    ['logPlay records history', async () => {
      const t = await dbBoss.createTrack('zzzzzzzzzzz', 'Z');
      await dbBoss.logPlay('zzzzzzzzzzz');
      const h = await db.playHistory.toArray();
      assert(h.length === 1 && h[0].ytId === 'zzzzzzzzzzz' && h[0].trackId === t, 'history row');
    }],
    ['export -> import round-trips + idempotent', async () => {
      const p = await dbBoss.createPl('Mix');
      const ta = await dbBoss.createTrack('aaaaaaaaaaa', 'Song A');
      const tb = await dbBoss.createTrack('bbbbbbbbbbb', 'Song B');
      await dbBoss.addToPlaylist(p, ta); await dbBoss.addToPlaylist(p, tb);
      await dbBoss.linkTracks(ta, tb);
      const dump = await dbBoss.exportData();
      await Promise.all([db.tracks, db.playlists, db.playlistTracks, db.links, db.playHistory].map(t => t.clear()));
      const r1 = await dbBoss.importData(dump);
      assert(r1.addedPlaylists === 1 && r1.addedTracks === 2 && r1.addedJoins === 2 && r1.addedLinks === 1, 'import counts');
      const r2 = await dbBoss.importData(dump);
      assert(r2.addedPlaylists === 0 && r2.addedTracks === 0 && r2.addedJoins === 0 && r2.addedLinks === 0, 're-import adds nothing');
      const plId = (await db.playlists.toArray())[0].id;
      const j = await db.playlistTracks.where('playlistId').equals(plId).sortBy('order');
      const names = (await db.tracks.bulkGet(j.map(x => x.trackId))).map(t => t.name);
      assert(names[0] === 'Song A' && names[1] === 'Song B', 'order preserved');
    }],
    ['import merges same-named playlist (no duplicate)', async () => {
      const p = await dbBoss.createPl('Keep');
      await dbBoss.addToPlaylist(p, await dbBoss.createTrack('old11111111', 'Old'));
      const r = await dbBoss.importData({ playlists: [ { name: 'Keep', tracks: [ { ytId: 'new11111111', name: 'New' } ] } ] });
      assert((await db.playlists.count()) === 1 && r.addedPlaylists === 0, 'no dup playlist');
      assert((await db.playlistTracks.where('playlistId').equals(p).count()) === 2, 'merged in');
    }],
    /* ── DJ AI: the parser meets whatever a stranger's AI felt like
       writing, and the roll has to stay unpredictable without going
       stupid. Every parser case here is a shape a real model produces. ── */
    ['DJ AI parses the full pipe format', async () => {
      const r = djAi.parseReply(
        "RIFFROLLED-PLAYLIST\nNAME: Late night drive\n" +
        "1 | Burial | Archangel | https://www.youtube.com/watch?v=abcdefghijk | 3:56 | dubstep | ghostly and patient\n" +
        "2 | Boards of Canada | Dayvan Cowboy | https://youtu.be/bbbbbbbbbbb | 5:00 | ambient | it opens right up\n" +
        "END");
      assert(r.name === 'Late night drive', 'name read');
      assert(r.items.length === 2, 'two tracks');
      assert(r.items[0].artist === 'Burial' && r.items[0].title === 'Archangel', 'fields split');
      assert(r.items[0].url === 'abcdefghijk', 'link reduced to an id');
      assert(r.items[0].secs === 236, 'duration in seconds');
      assert(r.items[0].genre === 'dubstep', 'genre kept');
      assert(r.items[0].why === 'ghostly and patient', 'why kept');
      assert(djAi.totalSecs(r.items) === 536, 'runtime totals up');
    }],
    ['DJ AI reads cells in any order, and older shapes', async () => {
      const shuffled = djAi.parseReply("1 | Mono | Ashes | 7:12 | https://youtu.be/ccccccccccc | post-rock | builds");
      assert(shuffled.items[0].url === 'ccccccccccc' && shuffled.items[0].secs === 432, 'duration and link found anywhere');
      assert(shuffled.items[0].artist === 'Mono' && shuffled.items[0].title === 'Ashes', 'artist/title still first');
      const old = djAi.parseReply("1 | Nujabes | Aruarian Dance | | soft entry");
      assert(old.items[0].url === '' && old.items[0].why === 'soft entry', 'the old 5-cell shape still reads');
    }],
    ['DJ AI parses JSON, prose and fences around it', async () => {
      const r = djAi.parseReply(
        "Sure! Here's a playlist:\n```json\n" +
        '{"name":"Rainy","tracks":[{"artist":"Nujabes","title":"Aruarian Dance","duration":"4:12","genre":"hip-hop","why":"soft"},' +
        '{"artist":"Mono","song":"Ashes in the Snow","url":"https://youtu.be/bbbbbbbbbbb"}]}' +
        "\n```\nEnjoy!");
      assert(r.name === 'Rainy', 'json name');
      assert(r.items.length === 2, 'json tracks');
      assert(r.items[0].secs === 252 && r.items[0].genre === 'hip-hop', 'json duration + genre');
      assert(r.items[1].title === 'Ashes in the Snow', 'song key accepted');
    }],
    ['DJ AI parses dashes and markdown tables', async () => {
      const dashes = djAi.parseReply("1. Aphex Twin - Avril 14th\n2) Erik Satie — Gymnopédie No.1\n3 - Nils Frahm – Says");
      assert(dashes.items.length === 3, 'dash lines');
      assert(dashes.items[2].artist === 'Nils Frahm' && dashes.items[2].title === 'Says', 'numbered dash split');
      const table = djAi.parseReply(
        "| # | Artist | Title |\n|---|---|---|\n| 1 | Portishead | Roads |\n| 2 | Massive Attack | Teardrop |");
      assert(table.items.length === 2, 'table rows, header and rule skipped');
      assert(table.items[1].artist === 'Massive Attack', 'index cell dropped');
    }],
    ['DJ AI parser dedupes, caps and never throws', async () => {
      const dup = djAi.parseReply("1 | A | Song\n2 | a | song\n3 | B | Other");
      assert(dup.items.length === 2, 'case-insensitive dedupe');
      let many = '';
      for (let i = 0; i < 60; i++) many += (i + 1) + ' | Artist' + i + ' | Title' + i + '\n';
      assert(djAi.parseReply(many).items.length === djAi.MAX_TRACKS, 'capped at MAX_TRACKS');
      assert(djAi.parseReply('').items.length === 0, 'empty input');
      assert(djAi.parseReply('I cannot help with that.').items.length === 0, 'refusal is not a playlist');
      assert(djAi.parseReply('{"broken": [').items.length === 0, 'broken json');
      assert(djAi.parseReply('1 | Jay-Z | 99 Problems').items[0].artist === 'Jay-Z', 'hyphenated artist survives');
    }],
    ['DJ AI seeds a vocabulary and rolls within it', async () => {
      await djAi.seed();
      await djAi.refresh();
      assert(djAi.cats.length >= 5, 'categories seeded');
      const activity = djAi.cat('activity');
      assert(activity && activity.options.length > 10, 'options seeded');
      assert(activity.options.every(o => Array.isArray(o.tags)), 'every option carries tags');
      const rolled = djAi.rollOption('activity');
      assert(rolled && activity.options.some(o => o.id === rolled.id), 'roll returns a real option');
      // 60 rolls of a 15-option category should not keep landing on one thing
      const seen = new Set();
      for (let i = 0; i < 60; i++) seen.add(djAi.rollOption('activity').label);
      assert(seen.size > 4, 'the dice are actually dice (' + seen.size + ' distinct)');
    }],
    ['DJ AI riff roll fills the brief; chaos still fills it', async () => {
      await djAi.seed(); await djAi.ensureAnyOptions(); await djAi.refresh();
      djAi.state.textMode = 'details';      // details rolls everything enabled
      await djAi.rollAll({});
      const enabled = djAi.cats.filter(c => c.enabled);
      assert(enabled.every(c => djAi.picked(c.key)), 'every enabled section gets a pick');
      assert(djAi.briefLine().indexOf('|') > 0, 'brief line assembles');
      await djAi.rollAll({ chaos:true });
      assert(djAi.state.chaos === true, 'chaos recorded on the state');
      // speed mode rolls only what is on screen
      djAi.state.textMode = 'speed';
      djAi.state.picks = {};
      await djAi.rollAll({});
      assert(djAi.SPEED_CORE.every(k => djAi.picked(k)), 'the four questions get rolled');
      assert(!djAi.picked('discovery'), 'what speed mode hides is left alone');
      djAi.state.textMode = 'details';
      await djAi.rollAll({ chaos:true });     // back to the full desk
      assert(enabled.every(c => djAi.picked(c.key)), 'chaos still fills every section');
      // unusual combinations must stay reachable: nothing is ever excluded
      assert(djAi.cat('activity').options.some(o => o.label === 'Funeral'), 'Funeral is still in the deck');
    }],
    ['DJ AI remembers favourites, use counts and custom options', async () => {
      await djAi.seed(); await djAi.refresh();
      const cat = djAi.cat('feel');
      const id = await djAi.addOption(cat.id, 'Haunted', ['dark','weird']);
      const mine = djAi.optionById(id);
      assert(mine && mine.builtin === false, 'custom option added');
      await djAi.pick('feel', id);
      assert(djAi.picked('feel').label === 'Haunted', 'and picked');
      assert(djAi.optionById(id).useCount === 1, 'use counted');
      await djAi.setFavourite(id, true);
      assert(djAi.optionById(id).favourite === 1, 'favourited');
      await djAi.removeOption(id);
      assert(!djAi.optionById(id), 'custom option deleted outright');
      const builtin = djAi.cat('feel').options.find(o => o.builtin);
      await djAi.removeOption(builtin.id);
      assert(djAi.optionById(builtin.id).hidden === true, 'built-in hides rather than vanishing');
    }],
    ['DJ AI builds a prompt that carries the brief and the rules', async () => {
      await djAi.seed(); await djAi.refresh();
      djAi.state.textMode = 'details';
      await djAi.rollAll({});
      djAi.state.count = 12; djAi.state.minutes = 48; djAi.state.maxTrackMin = 7;
      const p = await djAi.buildDetailsPrompt();
      assert(p.indexOf('Exactly 12 tracks') > 0, 'track count stated');
      assert(p.indexOf('about 48 minutes') > 0, 'time budget stated');
      assert(p.indexOf('No single track longer than 7 minutes') > 0, 'ceiling stated');
      assert(p.indexOf('YOUTUBE LINKS — REQUIRED') > 0, 'link instructions present');
      assert(p.indexOf('HARD REQUIREMENT') > 0, 'and the hard requirement');
      assert(p.indexOf('Never rely on') > 0, 'memory is not an acceptable source');
      assert(p.indexOf('RIFFROLLED-PLAYLIST') > 0, 'reply format present');
      assert(!/chatgpt|claude|gemini|openai/i.test(p), 'no AI provider is named');
      djAi.state.shareContext = false;
      const blind = await djAi.buildDetailsPrompt();
      assert(blind.indexOf('have not shared my listening history') > 0, 'the share toggle is honoured');
      djAi.state.shareContext = true;
    }],
    ['DJ AI speed mode: defaults, prompt and the dice', async () => {
      await djAi.seed(); await djAi.ensureAnyOptions(); await djAi.refresh();
      djAi.state.textMode = 'speed';
      djAi.state.picks = {};
      // every core category can say "you choose", and the dice never pick it
      djAi.SPEED_CORE.forEach(k => {
        const any = djAi.anyOption(k);
        assert(any, k + ' has a don\'t-mind option');
        assert(djAi.effective(k) === any, k + ' falls back to it');
      });
      for (let i = 0; i < 40; i++){
        assert(!djAi.rollOption('feel').any, 'the dice never land on don\'t mind');
      }
      djAi.state.count = 15; djAi.state.minutes = 60; djAi.state.maxTrackMin = 8;
      djAi.state.shareContext = false;
      const p = await djAi.buildSpeedPrompt();
      assert(p.indexOf('PHASE 1 — BE THE DJ') > 0, 'speed template used');
      assert(p.indexOf('PHASE 2 — FIND THE YOUTUBE LINKS') > 0, 'the two phases are separate');
      assert(p.indexOf('PHASE 1') < p.indexOf('PHASE 2'), 'and in that order — taste before lookup');
      assert(p.indexOf('Never invent, guess, or recall a YouTube video ID') > 0, 'ids may not be recalled');
      assert(p.indexOf('Choose exactly 15 tracks') > 0 && p.indexOf('exactly 15 real YouTube URLs') > 0,
        'the count reaches both phases');
      assert(p.indexOf('{{') < 0, 'every placeholder filled');
      assert(p.indexOf('Tracks: 15') > 0 && p.indexOf('Return exactly 15 tracks') > 0, 'count in both places');
      assert(p.indexOf('WHAT I ALREADY LISTEN TO') < 0, 'listening block gone when not sharing');
      assert(p.indexOf('Nothing in particular') > 0, 'don\'t-mind reads as a sentence, not a label');
      assert(p.indexOf('| duration | genre') > 0, 'speed output format, no why column');
    }],
    ['DJ AI speed mode: extras reach the prompt and the estimate', async () => {
      await djAi.seed(); await djAi.ensureAnyOptions(); await djAi.refresh();
      djAi.state.textMode = 'speed'; djAi.state.picks = {};
      djAi.state.count = 15; djAi.state.chaos = false; djAi.state.familiarity = 30;
      djAi.state.shareContext = false;
      const bare = djAi.estimateSecs();
      assert(bare === 60, '15 tracks of speed mode reads as a minute (' + bare + 's)');
      const plain = await djAi.buildSpeedPrompt();
      // open something under More settings: it must show up in both
      const disc = djAi.cat('discovery');
      await djAi.pick('discovery', disc.options.find(o => o.label === 'Deep cuts').id);
      const withExtra = await djAi.buildSpeedPrompt();
      assert(withExtra.indexOf('Deep cuts') > 0, 'the extra joins the brief');
      assert(withExtra.length > plain.length, 'and makes the prompt longer');
      assert(djAi.estimateSecs() > bare, 'and the estimate goes up');
      djAi.state.chaos = true;
      assert(djAi.estimateSecs() > bare * 1.2, 'chaos costs time too');
      djAi.state.chaos = false;
      // details mode is the slower read
      djAi.state.textMode = 'details';
      assert(djAi.estimateSecs() > bare * 2, 'details mode estimates much longer');
      assert(djAi.estimateLabel().indexOf('min') > 0, 'label reads in minutes');
      djAi.state.textMode = 'speed';
    }],
    ['DJ AI speed mode: DISCOVERY appears only when there is something to say', async () => {
      await djAi.seed(); await djAi.ensureAnyOptions(); await djAi.refresh();
      djAi.state.textMode = 'speed'; djAi.state.picks = {}; djAi.state.shareContext = false;
      djAi.state.familiarity = 30; djAi.state.chaos = false;
      const bare = await djAi.buildSpeedPrompt();
      assert(bare.indexOf('DISCOVERY') < 0, 'left alone, the DJ decides');
      assert(bare.indexOf('{{') < 0 && !/\n\n\n\n/.test(bare), 'and the gap closes cleanly');
      // moving familiarity alone is enough to say something
      djAi.state.familiarity = 50;
      const fam = await djAi.buildSpeedPrompt();
      assert(fam.indexOf('DISCOVERY') > 0 && fam.indexOf('Roughly 50% things I might know') > 0, 'familiarity shows');
      // a discovery pick brings its own line plus the fixed caveat
      const d = djAi.cat('discovery');
      await djAi.pick('discovery', d.options.find(o => o.label === 'Under-discovered artists').id);
      const both = await djAi.buildSpeedPrompt();
      assert(both.indexOf('people doing real work without much of an audience') > 0, 'the discovery line');
      assert(both.indexOf('Do not turn this into an obscure-music exercise') > 0, 'and the caveat');
      djAi.state.familiarity = 30;
    }],
    ['DJ AI speed mode shares the top ten, and only when asked', async () => {
      await djAi.seed(); await djAi.ensureAnyOptions(); await djAi.refresh();
      for (let i = 0; i < 12; i++){
        const yt = 'top' + String(i).padStart(8, 'x');
        await dbBoss.createTrack(yt, 'Song ' + i);
        await dbBoss.updateTrackMeta(yt, { artist: 'Artist ' + i });
        for (let n = 0; n <= i; n++) await dbBoss.logPlay(yt);   // i+1 plays
      }
      const top = await djAi.topTracks(10);
      assert(top.length === 10, 'ten of them');
      assert(top[0].indexOf('Song 11') > 0, 'most played first');
      djAi.state.textMode = 'speed'; djAi.state.shareContext = true;
      const shared = await djAi.buildSpeedPrompt();
      assert(shared.indexOf('10 most-played tracks') > 0, 'listening block present');
      assert(shared.indexOf('Song 11') > 0 && shared.indexOf('Song 0') < 0, 'top ten only');
      djAi.state.shareContext = false;
      assert((await djAi.buildSpeedPrompt()).indexOf('Song 11') < 0, 'and gone when switched off');
    }],
    ['DJ AI never mistakes an 11-character title for a video id', async () => {
      // Parcels' "Gamesofluck" is exactly eleven word characters. Before
      // this, the title was read as the link and everything shifted right.
      const r = djAi.parseReply("1 | Parcels | Gamesofluck | https://www.youtube.com/watch?v=vV3xPebC4E4 | 5:27 | Indie Funk");
      assert(r.items[0].url === 'vV3xPebC4E4', 'the link is the link');
      assert(r.items[0].title === 'Gamesofluck', 'the title stays the title');
      assert(r.items[0].genre === 'Indie Funk', 'and the genre still lands');
      // a bare id is still accepted where a link belongs
      const bare = djAi.parseReply("1 | Burial | Archangel | dQw4w9WgXcQ | 3:56 | dubstep");
      assert(bare.items[0].url === 'dQw4w9WgXcQ', 'bare id in the link cell still works');
      // but an eleven-character title with no link stays unplayable, not wrong
      const none = djAi.parseReply("1 | Someone | Elevenchars | | 4:00 | rock");
      assert(none.items[0].url === '' && none.items[0].title === 'Elevenchars', 'no link invented');
    }],
    ['DJ AI reads a genre in the last cell, a reason in a sentence', async () => {
      const speed = djAi.parseReply("1 | Burial | Archangel | https://youtu.be/aaaaaaaaaaa | 3:56 | dubstep");
      assert(speed.items[0].genre === 'dubstep' && !speed.items[0].why, 'a known genre is a genre');
      const twoWord = djAi.parseReply("1 | Mono | Ashes | https://youtu.be/bbbbbbbbbbb | 7:12 | post-rock");
      assert(twoWord.items[0].genre === 'post-rock', 'hyphenated genre');
      const suffix = djAi.parseReply("1 | Perturbator | Sentient | https://youtu.be/ccccccccccc | 5:00 | synthwave");
      assert(suffix.items[0].genre === 'synthwave', 'suffix genres recognised');
      const reason = djAi.parseReply("1 | Nujabes | Aruarian Dance | https://youtu.be/ddddddddddd | 4:12 | soft entry");
      assert(reason.items[0].why === 'soft entry' && !reason.items[0].genre, 'a phrase is a reason');
      const both = djAi.parseReply("1 | A | B | https://youtu.be/eeeeeeeeeee | 3:00 | techno | builds the set");
      assert(both.items[0].genre === 'techno' && both.items[0].why === 'builds the set', 'both when both are given');
    }],
    ['DJ AI imports a set into the playlist, keeping what the AI said', async () => {
      await djAi.seed(); await djAi.refresh();
      const parsed = djAi.parseReply(
        "NAME: Night Roads\n" +
        "1 | Burial | Archangel | https://www.youtube.com/watch?v=abcdefghijk | 3:56 | dubstep | ghostly\n" +
        "2 | Nobody | Nothing | | 4:00 | ambient | no link, cannot play\n");
      const saved = await djAi.importPlaylist(parsed, 'raw reply');
      assert(saved.count === 1 && saved.skipped === 1, 'only linked tracks are playable');
      assert(saved.totalSecs === 236, 'runtime from what the AI reported');
      const pl = await db.playlists.get(saved.playlistId);
      assert(pl.source === 'ai' && pl.name.indexOf('Night Roads') > 0, 'playlist named and marked');
      assert(pl.aiBrief && typeof pl.aiBrief.picks === 'object', 'the brief is kept with it');
      const t = await dbBoss.getTrack('abcdefghijk');
      assert(t.artist === 'Burial' && t.durSec === 236, 'artist and duration logged on the track');
      assert((t.tags || '').indexOf('dubstep') >= 0, 'genre logged as a tag too');
      const sess = await db.aiSessions.toArray();
      assert(sess.length === 1 && sess[0].items.length === 2, 'history keeps the unplayable line too');
      assert(sess[0].reply === 'raw reply', 'and the raw reply');
    }]
  ];

  // run against a throwaway DB so real data is never touched
  const realDb = db;
  const testDb = new Dexie('vinyl_selftest_' + Date.now());
  testDb.version(11).stores({
    playlists: '++id, name, createdAt, plays, tags',
    tracks: '++id, ytId, name, artist, tags, plays',
    playlistTracks: '++id, playlistId, trackId, addedAt, order',
    playHistory: '++id, trackId, ytId, ts',
    settings: 'k',
    reactions: '++id, ytId, trackId, kind, ts',
    aiSessions: '++id, ts, playlistId',
    djCategories: '++id, &key, order',
    djOptions: '++id, categoryId, favourite, useCount',
    links: '++id, &key, type, [type+a], [type+b], origin, createdBy, lastTs'
  });
  await testDb.open();

  const results = [];
  let pass = 0, fail = 0;
  db = testDb;                       // dbBoss now operates on the throwaway DB
  try {
    for (const [name, fn] of tests){
      await Promise.all([db.tracks, db.playlists, db.playlistTracks, db.links, db.playHistory, db.reactions, db.aiSessions, db.djCategories, db.djOptions].map(t => t.clear()));
      try { await fn(); results.push({ ok:true, name }); pass++; }
      catch (e){ results.push({ ok:false, name, msg:e.message }); fail++; }
    }
  } finally {
    db = realDb;                     // restore the real DB
    await testDb.delete();
  }

  results.forEach(r => console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.msg ? '  ::  ' + r.msg : '')));
  console.log(pass + ' passed, ' + fail + ' failed');

  // visible overlay
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:auto 16px 16px auto;z-index:3000;max-width:420px;background:#15151f;border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:12px 14px;font:13px/1.5 monospace;color:#e0e0e0;box-shadow:0 8px 32px rgba(0,0,0,.6);';
  box.innerHTML = '<b>Self-tests — ' + pass + ' passed, ' + fail + ' failed</b>' +
    results.map(r => '<div style="color:' + (r.ok ? '#5ab88a' : '#d46060') + '">' +
      (r.ok ? '✓' : '✗') + ' ' + r.name + (r.msg ? ' — ' + r.msg : '') + '</div>').join('') +
    '<div style="margin-top:8px;color:rgba(255,255,255,.4)">reload without #test for normal use</div>';
  document.body.appendChild(box);
}

if (location.hash.indexOf('test') !== -1 || location.search.indexOf('selftest') !== -1){
  window.addEventListener('load', runSelfTests);
}
