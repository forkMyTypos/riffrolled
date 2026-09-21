/* riffrolled — db.js
   Dexie schema + dbBoss: every read and write of local data. */

// app-wide banner for storage failures, quota, import/export feedback
function appNotify(msg, kind){
  var b = document.getElementById('appBanner');
  if(!b) return;
  clearTimeout(b._t);
  b.className = 'app-banner' + (kind ? ' ' + kind : '');
  b.innerHTML = '';
  var s = document.createElement('span'); s.textContent = msg; b.appendChild(s);
  var x = document.createElement('span'); x.className = 'x'; x.textContent = '✕';
  x.onclick = function(){ b.hidden = true; }; b.appendChild(x);
  b.hidden = false;
  if (kind === 'ok') b._t = setTimeout(function(){ b.hidden = true; }, 4000);
}

var db = new Dexie('VinylDB11');

db.version(2).stores({
  playlists: '++id, name, createdAt, plays, tags',
  tracks: '++id, ytId, name, artist, tags, plays',
  playlistTracks: '++id, playlistId, trackId, addedAt'
});

// v3 adds an explicit `order` field on join rows so tracks can be reordered.
db.version(3).stores({
  playlists: '++id, name, createdAt, plays, tags',
  tracks: '++id, ytId, name, artist, tags, plays',
  playlistTracks: '++id, playlistId, trackId, addedAt, order'
}).upgrade(async tx => {
  const rows = await tx.table('playlistTracks').toArray();
  rows.sort((a,b)=>(a.addedAt||0)-(b.addedAt||0));
  const next = {};
  for (const r of rows){
    const n = (next[r.playlistId] = (next[r.playlistId] ?? -1) + 1);
    await tx.table('playlistTracks').update(r.id, { order: n });
  }
});

// v4 adds a play-history log used by the Links panel
db.version(4).stores({
  playlists: '++id, name, createdAt, plays, tags',
  tracks: '++id, ytId, name, artist, tags, plays',
  playlistTracks: '++id, playlistId, trackId, addedAt, order',
  playHistory: '++id, trackId, ytId, ts'
});

// v5 adds explicit track <-> track links
db.version(5).stores({
  playlists: '++id, name, createdAt, plays, tags',
  tracks: '++id, ytId, name, artist, tags, plays',
  playlistTracks: '++id, playlistId, trackId, addedAt, order',
  playHistory: '++id, trackId, ytId, ts',
  trackLinks: '++id, a, b, createdAt'
});

// v6 adds a small key/value settings table (e.g. the YouTube Data API key)
db.version(6).stores({
  playlists: '++id, name, createdAt, plays, tags',
  tracks: '++id, ytId, name, artist, tags, plays',
  playlistTracks: '++id, playlistId, trackId, addedAt, order',
  playHistory: '++id, trackId, ytId, ts',
  trackLinks: '++id, a, b, createdAt',
  settings: 'k'
});

// v7 adds like/dislike reactions (a tally — you can react multiple times)
db.version(7).stores({
  playlists: '++id, name, createdAt, plays, tags',
  tracks: '++id, ytId, name, artist, tags, plays',
  playlistTracks: '++id, playlistId, trackId, addedAt, order',
  playHistory: '++id, trackId, ytId, ts',
  trackLinks: '++id, a, b, createdAt',
  settings: 'k',
  reactions: '++id, ytId, trackId, kind, ts'
});

// v8: trackPairs — a quiet local graph of which tracks get played together.
// Recorded automatically whenever one track follows another; no UI yet.
// This never leaves the device.
db.version(8).stores({
  playlists: '++id, name, createdAt, plays, tags',
  tracks: '++id, ytId, name, artist, tags, plays',
  playlistTracks: '++id, playlistId, trackId, addedAt, order',
  playHistory: '++id, trackId, ytId, ts',
  trackLinks: '++id, a, b, createdAt',
  settings: 'k',
  reactions: '++id, ytId, trackId, kind, ts',
  trackPairs: '++id, &key, a, b, count, lastTs'
});

var dbBoss = {
  createPl: async function(n){
    if(!n) n = 'Playlist';
    return await db.playlists.add({ name: n, createdAt: Date.now() });
  },

  getPlaylists: async function(){
    return await db.playlists.orderBy('createdAt').reverse().toArray();
  },

  createTrack: async function(ytId, name){
    if (window.deckHint) deckHint.hide();
    // ytId is interpolated into DOM attributes downstream — enforce its shape here
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(String(ytId || ''))) throw new Error('Invalid video id');
    if(!name) name = 'track';
    name = String(name).slice(0, 300);
    let existing = await db.tracks.where('ytId').equals(ytId).first();
    if(existing) return existing.id;
    return await db.tracks.add({ ytId, name, createdAt: Date.now() });
  },

  // add an existing track to a playlist (appended to the end). returns 'added' | 'dupe'
  addToPlaylist: async function(playlistId, trackId){
    const exists = await db.playlistTracks.where({ playlistId, trackId }).first();
    if(exists) return 'dupe';
    const count = await db.playlistTracks.where('playlistId').equals(playlistId).count();
    await db.playlistTracks.add({ playlistId, trackId, addedAt: Date.now(), order: count });
    return 'added';
  },

  countTracks: async function(playlistId){
    return await db.playlistTracks.where('playlistId').equals(playlistId).count();
  },

  // record a play (powers the Links panel)
  logPlay: async function(ytId){
    if(!ytId) return;
    try {
      const t = await db.tracks.where('ytId').equals(ytId).first();
      await db.playHistory.add({ trackId: t ? t.id : null, ytId: ytId, ts: Date.now() });
    } catch(e){}
  },

  // bundle everything into a portable, id-independent object
  exportData: async function(){
    const tracks = await db.tracks.toArray();
    const playlists = await db.playlists.orderBy('createdAt').toArray();
    const out = { app:'vinyl-player', version:1, exportedAt: Date.now(), library:[], playlists:[] };
    out.library = tracks.map(t => ({ ytId:t.ytId, name:t.name }));
    for (const pl of playlists){
      const joins = await db.playlistTracks.where('playlistId').equals(pl.id).sortBy('order');
      const items = [];
      for (const j of joins){
        const tr = tracks.find(t => t.id === j.trackId);
        if (tr) items.push({ ytId:tr.ytId, name:tr.name });
      }
      out.playlists.push({ name: pl.name, tracks: items });
    }
    out.links = [];
    const allLinks = await db.trackLinks.toArray();
    for (const l of allLinks){
      const ta = tracks.find(t => t.id === l.a);
      const tb = tracks.find(t => t.id === l.b);
      if (ta && tb) out.links.push({ a: ta.ytId, b: tb.ytId });
    }
    return out;
  },

  // merge an exported object into the current data — no duplicates
  importData: async function(obj){
    if(!obj || (!obj.playlists && !obj.library)) throw new Error('unrecognised file');
    let addedTracks = 0, addedPlaylists = 0, addedJoins = 0, addedLinks = 0;

    if (Array.isArray(obj.library)){
      for (const t of obj.library){
        if(!t || !t.ytId) continue;
        const before = await db.tracks.where('ytId').equals(t.ytId).first();
        await this.createTrack(t.ytId, t.name);
        if(!before) addedTracks++;
      }
    }
    if (Array.isArray(obj.playlists)){
      for (const pl of obj.playlists){
        if(!pl || !pl.name) continue;
        const existing = await db.playlists.where('name').equals(pl.name).first();
        const plId = existing ? existing.id : await this.createPl(pl.name);
        if (!existing) addedPlaylists++;
        if (Array.isArray(pl.tracks)){
          for (const t of pl.tracks){
            if(!t || !t.ytId) continue;
            const trackId = await this.createTrack(t.ytId, t.name);
            const r = await this.addToPlaylist(plId, trackId);
            if (r === 'added') addedJoins++;
          }
        }
      }
    }
    if (Array.isArray(obj.links)){
      for (const l of obj.links){
        if(!l || !l.a || !l.b) continue;
        const ta = await db.tracks.where('ytId').equals(l.a).first();
        const tb = await db.tracks.where('ytId').equals(l.b).first();
        if (ta && tb){ const r = await this.linkTracks(ta.id, tb.id); if (r === 'added') addedLinks++; }
      }
    }
    return { addedTracks, addedPlaylists, addedJoins, addedLinks };
  },

  // ── explicit track <-> track links (undirected, stored as a<b) ──
  linkTracks: async function(id1, id2){
    if(!id1 || !id2 || id1 === id2) return 'invalid';
    const a = Math.min(id1, id2), b = Math.max(id1, id2);
    const exists = await db.trackLinks.where('a').equals(a).and(r => r.b === b).first();
    if (exists) return 'dupe';
    await db.trackLinks.add({ a, b, createdAt: Date.now() });
    return 'added';
  },

  unlinkTracks: async function(id1, id2){
    const a = Math.min(id1, id2), b = Math.max(id1, id2);
    const ex = await db.trackLinks.where('a').equals(a).and(r => r.b === b).first();
    if (ex) await db.trackLinks.delete(ex.id);
  },

  getLinkedTrackIds: async function(trackId){
    const asA = await db.trackLinks.where('a').equals(trackId).toArray();
    const asB = await db.trackLinks.where('b').equals(trackId).toArray();
    const ids = new Set();
    asA.forEach(r => ids.add(r.b));
    asB.forEach(r => ids.add(r.a));
    return [...ids];
  },

  getSetting: async function(k){ const r = await db.settings.get(k); return r ? r.v : null; },
  setSetting: async function(k, v){ await db.settings.put({ k:k, v:v }); },

  getTrack: async function(ytId){ return await db.tracks.where('ytId').equals(ytId).first(); },
  updateTrackMeta: async function(ytId, fields){
    const t = await db.tracks.where('ytId').equals(ytId).first();
    if (t) await db.tracks.update(t.id, fields);
  },
  addReaction: async function(ytId, kind){
    if(!ytId) return;
    const t = await db.tracks.where('ytId').equals(ytId).first();
    await db.reactions.add({ ytId:ytId, trackId: t ? t.id : null, kind:kind, ts: Date.now() });
  },
  // passive link tracking: "a played next to b". Normalised a<b, one row
  // per pair, count strengthens with every co-occurrence. Local only.
  recordPair: async function(prevYt, curYt){
    if (!prevYt || !curYt || prevYt === curYt) return;
    const a = prevYt < curYt ? prevYt : curYt;
    const b = prevYt < curYt ? curYt : prevYt;
    const key = a + '|' + b;
    const row = await db.trackPairs.where('key').equals(key).first();
    if (row) await db.trackPairs.update(row.id, { count: (row.count || 1) + 1, lastTs: Date.now() });
    else await db.trackPairs.add({ key, a, b, count: 1, lastTs: Date.now() });
  },

  // play counts per ytId from local history (for most/least-played mixes)
  getPlayCounts: async function(){
    const rows = await db.playHistory.toArray();
    const counts = {};
    rows.forEach(r => { if (r.ytId) counts[r.ytId] = (counts[r.ytId] || 0) + 1; });
    return counts;
  },

  getReactions: async function(ytId){
    const rows = await db.reactions.where('ytId').equals(ytId).toArray();
    let like = 0, dislike = 0;
    rows.forEach(r => { if (r.kind === 'like') like++; else if (r.kind === 'dislike') dislike++; });
    return { like:like, dislike:dislike };
  }
};

// surface storage failures instead of dying silently
db.open().catch(function(err){
  appNotify('Local storage couldn’t be opened, so your library can’t be saved or loaded. If you’re in private/incognito mode, try a normal window.', 'warn');
  console.error('Dexie open failed:', err);
});

window.addEventListener('unhandledrejection', function(e){
  var r = e && e.reason;
  var name = (r && (r.name || (r.constructor && r.constructor.name))) || '';
  var text = String((r && r.message) || r || '');
  if (/quota/i.test(name) || /quota/i.test(text)){
    appNotify('Storage is full — recent changes may not have saved. Export your data, then free up space.', 'warn');
  } else if (/database|dexie|indexeddb|transaction/i.test(name) || /indexeddb/i.test(text)){
    appNotify('A storage error occurred — a recent change may not have been saved.', 'warn');
  }
});
