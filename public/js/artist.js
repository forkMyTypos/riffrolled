/* riffrolled — artist.js
   "Listen to more of this artist."

   WHY THIS IS MOSTLY NOT ABOUT LISTENING

   tracks.artist is whatever the AI wrote or whatever YouTube's channel
   was called, so one band arrives as "Cannons", "Cannons - Topic",
   "CannonsVEVO", "cannons" and, for a third of tracks, blank with the name
   sitting in the title ("Cannons - Fire For You"). A button that matches
   the exact string works on a minority of tracks and silently does
   nothing on the rest, which is worse than no button.

   So the work is deciding when two tracks are by the same artist:

     · clean the name (drop "- Topic", "VEVO", "Official")
     · fold it for comparison (case, accents, "&" vs "and", a leading "The")
     · where artist is blank, read it from "Artist - Title"
     · let a collaboration match its members ("Burial & Four Tet" is
       Burial), but never the other way round on a first name alone

   The matching is pure, takes plain objects, and has no idea the page
   exists — so it can be tested to death, and the Database panel can use it
   to group properly later. The part that touches the library and the
   playlist is below it, and is deliberately thin.

   Local library first: it is instant and needs no network. The shared
   catalogue is asked only when the library has nothing else by them. */

var riffArtist = {
  MAX_QUEUE: 25,

  /** "Cannons - Topic" → "Cannons". Display form: case and spelling kept. */
  clean: function(name){
    var s = String(name == null ? '' : name).replace(/[​-‏﻿]/g, '').trim();
    if (!s) return '';
    var prev;
    do {
      prev = s;
      s = s.replace(/\s*[-–—]\s*topic$/i, '')
           .replace(/\s*vevo$/i, '')
           .replace(/\s+official(\s+(channel|music|artist(\s+channel)?|video|page))?$/i, '')
           .replace(/[\s\-–—,.:;|]+$/, '')
           .trim();
    } while (s !== prev);
    // placeholders are not artists
    if (/^(various artists?|unknown( artist)?|va|n\/?a|none|-+|youtube)$/i.test(s)) return '';
    return s;
  },

  /** Comparison form. */
  fold: function(s){
    var t = String(s || '').toLowerCase();
    try { t = t.normalize('NFKD').replace(/[̀-ͯ]/g, ''); } catch(e){}
    t = t.replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
    t = t.replace(/^the /, '');
    return t;
  },

  /**
   * Every key this artist can be found under, most specific first.
   *   "Burial & Four Tet feat. X" → ["burial and four tet", "burial and four tet", "burial"]
   * deduped, so that example is two keys.
   */
  keys: function(name){
    var c = this.clean(name);
    if (!c) return [];
    var part = c.split(/\s+(?:feat\.?|ft\.?|featuring|with|vs\.?|x)\s+|\s*\(\s*(?:feat|ft)[^)]*\)?|\s*[\/;]\s*/i)[0].trim();
    var first = part.split(/\s*(?:,|&|\+)\s*|\s+and\s+/i)[0].trim();
    var out = [];
    [c, part, first].forEach(function(x){
      var k = riffArtist.fold(x);
      if (k.length >= 2 && out.indexOf(k) < 0) out.push(k);
    });
    return out;
  },

  /**
   * Who made this track? Works on any object with name / artist.
   * Returns { name, keys, from } or null when it cannot tell.
   */
  of: function(t){
    if (!t) return null;
    var a = this.clean(t.artist);
    if (a){
      var ks = this.keys(a);
      if (ks.length) return { name: a, keys: ks, from: 'artist' };
    }
    // blank artist: "Artist - Title" in the title is the next best thing
    var title = String(t.name || t.ytTitle || '');
    var m = /^(.{1,60}?)\s+[-–—]\s+\S/.exec(title);
    if (m){
      var d = this.clean(m[1]);
      var kd = this.keys(d);
      if (d && kd.length) return { name: d, keys: kd, from: 'title' };
    }
    return null;
  },

  /**
   * Are these by the same artist? One side's WHOLE name has to be a way of
   * finding the other ("Burial" is a key of "Burial & Four Tet"), or both
   * must be the same lead artist on different features. Two names that
   * merely start alike do not match.
   *
   * Known limit, accepted: a group whose name contains a comma or an
   * ampersand ("Earth, Wind & Fire") is also findable as its first word.
   * Avoiding that needs a list of such names, which would be wrong the day
   * it was written.
   */
  same: function(a, b){
    if (!a || !b) return false;
    return b.keys.indexOf(a.keys[0]) >= 0 || a.keys.indexOf(b.keys[0]) >= 0 ||
           // a collaboration's own member name, matched on the part before "feat"
           (a.keys[1] && b.keys.indexOf(a.keys[1]) >= 0 && a.keys[1] === b.keys[1]);
  },

  /** The rows in `rows` by the same artist as `track`, excluding it. */
  others: function(track, rows){
    var me = this.of(track);
    if (!me) return [];
    return (rows || []).filter(function(r){
      if (!r || r.ytId === track.ytId || r.playable === 0) return false;
      return riffArtist.same(me, riffArtist.of(r));
    });
  },

  /* ── the part that touches the page ─────────────────────────────── */

  /** The library's other tracks by whoever made `ytId`. */
  async localOthers(ytId){
    var t = await dbBoss.getTrack(ytId);
    if (!t) return { artist: null, rows: [] };
    var me = this.of(t);
    if (!me) return { artist: null, rows: [] };
    var all = await db.tracks.toArray();
    return { artist: me.name, rows: this.others(t, all) };
  },

  /** The shared catalogue's tracks by the same artist that the library lacks. */
  async catalogueOthers(ytId){
    var t = await dbBoss.getTrack(ytId);
    var me = this.of(t);
    if (!me) return [];
    var have = {};
    (await db.tracks.toArray()).forEach(function(r){ have[r.ytId] = 1; });
    var found = [];
    try {
      var r = await fetch('/api/search?q=' + encodeURIComponent(me.name) + '&limit=50&source=db');
      if (!r.ok) return [];
      var list = await r.json();
      (Array.isArray(list) ? list : []).forEach(function(row){
        var m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(row.url || '');
        if (!m || have[m[1]] || m[1] === ytId) return;
        var rowArtist = riffArtist.of({ artist: row.artist, name: row.name });
        if (rowArtist && riffArtist.same(me, rowArtist)){
          have[m[1]] = 1;
          found.push({ ytId: m[1], name: row.name || m[1], artist: rowArtist.name });
        }
      });
    } catch(e){ /* the catalogue is a bonus, never a requirement */ }
    return found;
  },

  /**
   * Put more of this artist next in line.
   * Returns { ok, artist, queued, fromLibrary, fromCatalogue, message }.
   */
  async queueMore(ytId, afterYtId){
    ytId = ytId || (window.player && player.currentYtId);
    if (!ytId) return { ok:false, message:'Nothing is playing.' };
    // the artist comes from `ytId`; "next" is relative to what is playing,
    // which is not the same track when Track info is pinned elsewhere
    afterYtId = afterYtId || (window.player && player.currentYtId) || ytId;

    var lib = await this.localOthers(ytId);
    if (!lib.artist) return { ok:false, message:'riffrolled doesn’t know who made this one.' };

    var ids = lib.rows.slice(0, this.MAX_QUEUE).map(function(r){ return r.ytId; });
    var fromLibrary = ids.length, fromCatalogue = 0;

    if (!ids.length){
      var more = await this.catalogueOthers(ytId);
      for (var i = 0; i < more.length && ids.length < this.MAX_QUEUE; i++){
        try {
          await dbBoss.createTrack(more[i].ytId, more[i].name);
          if (more[i].artist) await dbBoss.updateTrackMeta(more[i].ytId, { artist: more[i].artist });
          ids.push(more[i].ytId); fromCatalogue++;
        } catch(e){}
      }
    }
    if (!ids.length){
      return { ok:false, artist: lib.artist, queued:0,
               message:'That’s the only ' + lib.artist + ' track riffrolled knows about.' };
    }

    var n = await plBoss.queueAfterCurrent(afterYtId, ids, lib.artist);
    return { ok:true, artist: lib.artist, queued: n, fromLibrary: fromLibrary, fromCatalogue: fromCatalogue,
             message: n + ' more from ' + lib.artist + ' up next' + (fromCatalogue ? ' (from the shared catalogue)' : '') };
  }
};
