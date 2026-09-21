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
    ['linkTracks undirected/deduped/self-reject; unlink', async () => {
      const x = await dbBoss.createTrack('x1111111111', 'X');
      const y = await dbBoss.createTrack('y1111111111', 'Y');
      assert((await dbBoss.linkTracks(x, y)) === 'added');
      assert((await dbBoss.linkTracks(y, x)) === 'dupe', 'reverse is dup');
      assert((await dbBoss.linkTracks(x, x)) === 'invalid', 'self invalid');
      assert((await dbBoss.getLinkedTrackIds(x)).includes(y) && (await dbBoss.getLinkedTrackIds(y)).includes(x), 'bidirectional');
      await dbBoss.unlinkTracks(x, y);
      assert((await dbBoss.getLinkedTrackIds(x)).length === 0, 'unlinked');
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
      await Promise.all([db.tracks, db.playlists, db.playlistTracks, db.trackLinks, db.playHistory].map(t => t.clear()));
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
    ['recordPair normalises, dedupes and counts', async () => {
      await dbBoss.recordPair('bbbbbbbbbbb', 'aaaaaaaaaaa');
      await dbBoss.recordPair('aaaaaaaaaaa', 'bbbbbbbbbbb');
      await dbBoss.recordPair('aaaaaaaaaaa', 'aaaaaaaaaaa');   // self: ignored
      const rows = await db.trackPairs.toArray();
      assert(rows.length === 1, 'one row per pair');
      assert(rows[0].a === 'aaaaaaaaaaa' && rows[0].b === 'bbbbbbbbbbb', 'normalised a<b');
      assert(rows[0].count === 2, 'count strengthens');
    }]
  ];

  // run against a throwaway DB so real data is never touched
  const realDb = db;
  const testDb = new Dexie('vinyl_selftest_' + Date.now());
  testDb.version(8).stores({
    playlists: '++id, name, createdAt, plays, tags',
    tracks: '++id, ytId, name, artist, tags, plays',
    playlistTracks: '++id, playlistId, trackId, addedAt, order',
    playHistory: '++id, trackId, ytId, ts',
    trackLinks: '++id, a, b, createdAt',
    settings: 'k',
    reactions: '++id, ytId, trackId, kind, ts',
    trackPairs: '++id, &key, a, b, count, lastTs'
  });
  await testDb.open();

  const results = [];
  let pass = 0, fail = 0;
  db = testDb;                       // dbBoss now operates on the throwaway DB
  try {
    for (const [name, fn] of tests){
      await Promise.all([db.tracks, db.playlists, db.playlistTracks, db.trackLinks, db.playHistory, db.reactions, db.trackPairs].map(t => t.clear()));
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
