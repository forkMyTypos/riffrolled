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

// v9: aiSessions — what the AI DJ was asked for, what it answered, and
// what each line resolved to (including what didn't). The playlist itself
// is an ordinary playlists row; this is its provenance. Local, like the
// rest of this database — no AI DJ request ever leaves the browser.
db.version(9).stores({
  playlists: '++id, name, createdAt, plays, tags',
  tracks: '++id, ytId, name, artist, tags, plays',
  playlistTracks: '++id, playlistId, trackId, addedAt, order',
  playHistory: '++id, trackId, ytId, ts',
  trackLinks: '++id, a, b, createdAt',
  settings: 'k',
  reactions: '++id, ytId, trackId, kind, ts',
  trackPairs: '++id, &key, a, b, count, lastTs',
  aiSessions: '++id, ts, playlistId'
});

// v10: the DJ AI menu is data, not markup. djCategories/djOptions are
// seeded from dj-data.js on first run and belong to the user after that —
// they can favourite options, hide ones they never pick, add their own,
// and add whole categories, all of which join the Riff Roll automatically.
db.version(10).stores({
  playlists: '++id, name, createdAt, plays, tags',
  tracks: '++id, ytId, name, artist, tags, plays',
  playlistTracks: '++id, playlistId, trackId, addedAt, order',
  playHistory: '++id, trackId, ytId, ts',
  trackLinks: '++id, a, b, createdAt',
  settings: 'k',
  reactions: '++id, ytId, trackId, kind, ts',
  trackPairs: '++id, &key, a, b, count, lastTs',
  aiSessions: '++id, ts, playlistId',
  djCategories: '++id, &key, order',
  djOptions: '++id, categoryId, favourite, useCount'
});

/* v11: one links table, replacing trackLinks (hand-made links) and
   trackPairs (the quiet "played near each other" graph).

   A link is two track ids, a type, and a score:

     type     what the relationship is. PLAY_ORDER is directional —
              a → b means a was played BEFORE b, and the same row answers
              "what follows a" and "what comes before b". RELATED is not
              directional, so those rows are stored with a < b and one row
              serves both directions.
     origin   'manual' when a person asserted it, 'auto' when riffrolled
              observed it. Only manual links have an author, and only
              manual links can ever earn their maker anything.
     count    raw evidence, only ever incremented.
     score    what consumers rank by. Today it equals count; keeping them
              apart means a cleverer score later can be recomputed without
              destroying the evidence underneath it.

   Endpoints are ytIds, not row ids: ytIds survive export, import and a
   second device, which is exactly what the old trackLinks table had to
   translate around on every backup.

   SAME_PLAYLIST is deliberately absent. Playlist membership is already
   stored in playlistTracks, so co-occurrence is a query, not a table —
   materialising it would duplicate data, go stale on every edit, and a
   2,000-track channel import alone would write two million rows. */
db.version(11).stores({
  playlists: '++id, name, createdAt, plays, tags',
  tracks: '++id, ytId, name, artist, tags, plays',
  playlistTracks: '++id, playlistId, trackId, addedAt, order',
  playHistory: '++id, trackId, ytId, ts',
  trackLinks: null,                       // migrated into links below
  trackPairs: null,                       // direction was lost; not worth keeping
  settings: 'k',
  reactions: '++id, ytId, trackId, kind, ts',
  aiSessions: '++id, ts, playlistId',
  djCategories: '++id, &key, order',
  djOptions: '++id, categoryId, favourite, useCount',
  links: '++id, &key, type, [type+a], [type+b], origin, createdBy, lastTs'
}).upgrade(async tx => {
  // hand-made links carry over as RELATED, keyed by ytId and marked manual
  const tracks = await tx.table('tracks').toArray();
  const ytOf = {};
  tracks.forEach(t => { ytOf[t.id] = t.ytId; });
  const old = await tx.table('trackLinks').toArray();
  const now = Date.now();
  for (const l of old){
    const ya = ytOf[l.a], yb = ytOf[l.b];
    if (!ya || !yb || ya === yb) continue;
    const a = ya < yb ? ya : yb, b = ya < yb ? yb : ya;
    const key = 'RELATED:' + a + '>' + b;
    const exists = await tx.table('links').where('key').equals(key).first();
    if (exists) continue;
    await tx.table('links').add({
      key, type:'RELATED', origin:'manual', a, b, count:1, score:1,
      createdBy:'', firstTs: l.createdAt || now, lastTs: l.createdAt || now
    });
  }
  // trackPairs is dropped on purpose: it stored a<b, so "a was played
  // before b" was thrown away at write time and cannot be recovered.
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
    // links already speak in ytIds, so a backup carries them as they are —
    // type, direction, origin, author and the evidence behind them
    const allLinks = await db.links.toArray();
    allLinks.forEach(l => {
      out.links.push({
        type: l.type, origin: l.origin, a: l.a, b: l.b,
        count: l.count || 1, by: l.createdBy || ''
      });
    });
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
        // a backup's links restore with their type, direction and author;
        // older backups only carried a pair, which was always a manual one
        const r = await this.link(l.type || 'RELATED', l.a, l.b, {
          origin: l.origin === 'auto' ? 'auto' : 'manual',
          by: l.by || '', inc: Math.max(1, Math.floor(Number(l.count) || 1))
        });
        if (r === 'added') addedLinks++;
      }
    }
    return { addedTracks, addedPlaylists, addedJoins, addedLinks };
  },

  /* ── LINKS ───────────────────────────────────────────────────────────
     Two kinds, one table.

       MANUAL     a person said these belong together. Has an author, and
                  is the kind that can earn its maker something when other
                  people follow it.
       AUTOMATIC  riffrolled noticed it. No author, nobody gets paid, and
                  it is only ever evidence.

     A human asserting a link riffrolled already observed upgrades that row
     from auto to manual — the first person to say it out loud is its
     author, and the evidence already gathered carries over. ── */

  LINK_DIRECTED: { PLAY_ORDER: true },      // which types care about order

  /** canonical key for a link; undirected types sort their endpoints so
      one row answers both directions */
  linkKey: function(type, a, b){
    if (!dbBoss.LINK_DIRECTED[type] && b < a){ const t = a; a = b; b = t; }
    return { key: type + ':' + a + '>' + b, a, b };
  },

  /**
   * Record or strengthen a link.
   *   type    'PLAY_ORDER' (a → b, directional) | 'RELATED' | your own
   *   opts    { origin:'auto'|'manual', by:walletKey, inc:1 }
   * Returns 'added' | 'strengthened' | 'claimed' | 'invalid'.
   */
  link: async function(type, aYt, bYt, opts){
    opts = opts || {};
    if (!type || !aYt || !bYt || aYt === bYt) return 'invalid';
    const k = dbBoss.linkKey(type, aYt, bYt);
    const origin = opts.origin === 'manual' ? 'manual' : 'auto';
    const inc = Math.max(1, Math.floor(opts.inc || 1));
    const now = Date.now();

    const row = await db.links.where('key').equals(k.key).first();
    if (!row){
      await db.links.add({
        key: k.key, type: type, origin: origin, a: k.a, b: k.b,
        count: inc, score: inc,
        createdBy: origin === 'manual' ? (opts.by || '') : '',
        firstTs: now, lastTs: now
      });
      return 'added';
    }

    const fields = { count: (row.count || 0) + inc, score: (row.score || 0) + inc, lastTs: now };
    // a person claiming a link riffrolled had only observed
    let result = 'strengthened';
    if (origin === 'manual' && row.origin !== 'manual'){
      fields.origin = 'manual';
      fields.createdBy = opts.by || '';
      result = 'claimed';
    }
    await db.links.update(row.id, fields);
    return result;
  },

  /** a person says these two belong together */
  linkManual: async function(aYt, bYt, by, type){
    return dbBoss.link(type || 'RELATED', aYt, bYt, { origin:'manual', by: by || '' });
  },

  unlink: async function(type, aYt, bYt){
    const k = dbBoss.linkKey(type || 'RELATED', aYt, bYt);
    const row = await db.links.where('key').equals(k.key).first();
    if (row) await db.links.delete(row.id);
  },

  /** what tends to follow a — or, for an undirected type, what sits beside it */
  linksFrom: async function(type, aYt, limit){
    const rows = await db.links.where('[type+a]').equals([type, aYt]).toArray();
    const out = rows.map(r => ({ ytId: r.b, score: r.score || 0, count: r.count || 0,
                                 origin: r.origin, createdBy: r.createdBy || '' }));
    if (!dbBoss.LINK_DIRECTED[type]){
      const back = await db.links.where('[type+b]').equals([type, aYt]).toArray();
      back.forEach(r => out.push({ ytId: r.a, score: r.score || 0, count: r.count || 0,
                                   origin: r.origin, createdBy: r.createdBy || '' }));
    }
    out.sort((x, y) => y.score - x.score);
    return limit ? out.slice(0, limit) : out;
  },

  /** what tends to come before b */
  linksTo: async function(type, bYt, limit){
    if (!dbBoss.LINK_DIRECTED[type]) return dbBoss.linksFrom(type, bYt, limit);
    const rows = await db.links.where('[type+b]').equals([type, bYt]).toArray();
    const out = rows.map(r => ({ ytId: r.a, score: r.score || 0, count: r.count || 0,
                                 origin: r.origin, createdBy: r.createdBy || '' }));
    out.sort((x, y) => y.score - x.score);
    return limit ? out.slice(0, limit) : out;
  },

  /* ── SAME PLAYLIST, derived ──────────────────────────────────────────
     Not a table: playlistTracks already holds every membership, so
     "what shares a playlist with this" is a query. Always current, never
     stale after an edit, and it cannot explode — materialising it would
     write n(n−1)/2 rows per playlist, which is two million for one
     2,000-track channel import. ── */
  samePlaylist: async function(ytId, limit){
    const track = await db.tracks.where('ytId').equals(ytId).first();
    if (!track) return [];
    const mine = await db.playlistTracks.where('trackId').equals(track.id).toArray();
    if (!mine.length) return [];

    const counts = {};
    for (const join of mine){
      const siblings = await db.playlistTracks.where('playlistId').equals(join.playlistId).toArray();
      siblings.forEach(s => {
        if (s.trackId === track.id) return;
        counts[s.trackId] = (counts[s.trackId] || 0) + 1;    // how many playlists share them
      });
    }
    const ids = Object.keys(counts).map(Number);
    const rows = await db.tracks.bulkGet(ids);
    return rows
      .map((t, i) => t ? { ytId: t.ytId, name: t.name, artist: t.artist || '', score: counts[ids[i]] } : null)
      .filter(Boolean)
      .sort((x, y) => y.score - x.score)
      .slice(0, limit || 20);
  },

  /* ── kept for the code that already speaks in track ids ── */
  linkTracks: async function(id1, id2, by){
    if (!id1 || !id2 || id1 === id2) return 'invalid';
    const [ta, tb] = await db.tracks.bulkGet([id1, id2]);
    if (!ta || !tb) return 'invalid';
    const r = await dbBoss.linkManual(ta.ytId, tb.ytId, by);
    return r === 'strengthened' ? 'dupe' : (r === 'claimed' ? 'added' : r);
  },

  unlinkTracks: async function(id1, id2){
    const [ta, tb] = await db.tracks.bulkGet([id1, id2]);
    if (ta && tb) await dbBoss.unlink('RELATED', ta.ytId, tb.ytId);
  },

  getLinkedTrackIds: async function(trackId){
    const t = await db.tracks.get(trackId);
    if (!t) return [];
    const linked = await dbBoss.linksFrom('RELATED', t.ytId);
    const ids = [];
    for (const l of linked){
      const row = await db.tracks.where('ytId').equals(l.ytId).first();
      if (row) ids.push(row.id);
    }
    return ids;
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
  /* ── PLAY ORDER, recorded automatically ──────────────────────────────
     One track following another is evidence that they go together — but
     only sometimes. Two gates, because unfiltered the graph fills with
     noise:

       dwell  the previous track must have actually played for a while. A
              two-second skip is evidence of dislike; recording it as "a
              goes with b" is worse than recording nothing.
       gap    a track played hours later is a new session, not a sequence.

     Direction is kept: a → b means a was played BEFORE b. The old
     trackPairs table sorted its endpoints and threw that away. ── */
  PLAY_DWELL_MS: 20000,          // the previous track has to have been listened to
  PLAY_GAP_MS: 10 * 60 * 1000,   // and this one has to follow it reasonably soon

  recordPair: async function(prevYt, curYt, meta){
    if (!prevYt || !curYt || prevYt === curYt) return 'skipped';
    meta = meta || {};
    const dwell = Number(meta.dwellMs);
    if (Number.isFinite(dwell)){
      if (dwell < dbBoss.PLAY_DWELL_MS) return 'skipped';            // skipped past it
      if (dwell > dbBoss.PLAY_GAP_MS) return 'skipped';              // different session
    }
    return dbBoss.link('PLAY_ORDER', prevYt, curYt, { origin:'auto' });
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
