/* riffrolled — agent.js
   A small, stable, documented surface for anything driving riffrolled
   that is not a pair of hands.

   WHY THIS EXISTS RATHER THAN BETTER BUTTONS

   An AI agent asked for sturdier handholds on the UI: stable selectors,
   a status message that lingers, a paste box that reacts to a
   programmatic value. Most of that is fair and is done (see the
   data-testid attributes through the panels, and the live state below).

   But the request underneath it is not "let me click more reliably", it
   is "let me add tracks". Scraping a DOM to do that is fragile however
   many hooks it is given: every layout change is a breakage, and an
   agent that has to find a textarea, set it, dispatch an event and find
   a button is four chances to fail where one call would do.

   So this is the call. It is riffrolled's own code path — the same
   functions the Import panel uses — exposed deliberately, versioned, and
   safe to depend on. The DOM is free to change underneath it.

   WHAT IT IS NOT

   It takes no money, spends no credits, and reaches nothing outside the
   page's own origin. Everything here is something the person could do by
   hand in the UI; it is a shortcut, not a privilege. Nothing here can
   promote a track, move a balance, or read a wallet. */

(function(){
  var VERSION = 1;

  /** The same accepted forms as the paste box: urls, short links, bare ids. */
  function parseIds(text){
    var ids = [], seen = {};
    String(text == null ? '' : text).split(/[\s,]+/).forEach(function(tok){
      if (!tok) return;
      var m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(tok)
           || /youtu\.be\/([A-Za-z0-9_-]{11})/.exec(tok)
           || /\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})/.exec(tok)
           || /^([A-Za-z0-9_-]{11})$/.exec(tok);
      if (m && !seen[m[1]]){ seen[m[1]] = 1; ids.push(m[1]); }
    });
    return ids;
  }

  /* Live state on <html>, so a caller can poll one attribute instead of
     reading a status string that was written for a person and may be
     mid-animation, cleared, or phrased differently next release. */
  function publish(patch){
    var el = document.documentElement;
    Object.keys(patch).forEach(function(k){
      var v = patch[k];
      if (v === null || v === undefined) el.removeAttribute(k);
      else el.setAttribute(k, String(v));
    });
  }

  async function refreshState(){
    try {
      publish({
        'data-rr-tracks': await db.tracks.count(),
        'data-rr-playlist-tracks': (window.plBoss && plBoss.queue) ? plBoss.queue.length : 0,
        'data-rr-playing': (window.player && player.isPlaying) ? '1' : '0',
        'data-rr-current': (window.player && player.currentYtId) || ''
      });
    } catch(e){ /* best effort: state is a convenience, never a dependency */ }
  }

  var api = {
    version: VERSION,

    /** Everything a caller might want to check, in one object. */
    async state(){
      var out = { version: VERSION, ready: !!(window.dbBoss && window.plBoss),
                  tracks: 0, playlists: 0, playlistTracks: 0,
                  playing: false, currentId: '', playlistName: '' };
      try {
        out.tracks = await db.tracks.count();
        out.playlists = await db.playlists.count();
        if (window.plBoss){
          out.playlistTracks = (plBoss.queue || []).length;
          var pl = plBoss.activeId ? await db.playlists.get(plBoss.activeId) : null;
          out.playlistName = pl ? pl.name : '';
        }
        if (window.player){
          out.playing = !!player.isPlaying;
          out.currentId = player.currentYtId || '';
        }
      } catch(e){ out.error = String(e && e.message || e); }
      return out;
    },

    /**
     * Add YouTube videos to the library and the current playlist.
     *
     * Accepts a string (urls/ids in any mix, the way a person would
     * paste) or an array. Returns what happened, per id, so a caller
     * never has to infer success from a status message.
     */
    async addTracks(input, opts){
      opts = opts || {};
      var ids = Array.isArray(input)
        ? parseIds(input.join(' '))
        : parseIds(input);
      if (!ids.length) return { ok:false, error:'no video links or ids found', added:0, ids:[] };

      var made = [], failed = [];
      for (var i = 0; i < ids.length; i++){
        var id = ids[i], title = 'Video ' + id;
        if (opts.lookupTitles !== false){
          try {
            var r = await fetch('https://www.youtube.com/oembed?url=' +
              encodeURIComponent('https://www.youtube.com/watch?v=' + id) + '&format=json');
            if (r.ok){ var d = await r.json(); if (d.title) title = d.title; }
          } catch(e){ /* offline: the id is a usable title */ }
        }
        try {
          var tid = await dbBoss.createTrack(id, title);
          // the shared catalogue too, exactly as the Import panel does
          try {
            var cw = window.riffWallet ? await riffWallet.get() : '';
            fetch('/api/track', { method:'POST', headers:{ 'content-type':'application/json' },
              body: JSON.stringify({ name:title, url:'https://www.youtube.com/watch?v=' + id, wallet:cw }) });
          } catch(e2){}
          if (opts.toPlaylist !== false && window.plBoss && plBoss.activeId){
            await dbBoss.addToPlaylist(plBoss.activeId, tid);
          }
          made.push({ id:id, title:title, trackId:tid });
        } catch(e){ failed.push({ id:id, error:String(e && e.message || e) }); }
      }

      try { if (window.plBoss) plBoss.afterDbChange(); } catch(e){}
      await refreshState();
      publish({ 'data-rr-last-added': made.length, 'data-rr-last-action': 'addTracks' });
      return { ok: made.length > 0, added: made.length, tracks: made,
               failed: failed, ids: ids };
    },

    /**
     * Hand riffrolled a whole AI reply, the way the DJ panel's paste box
     * does — parsing, link checking, resolving what has no link, and
     * building the playlist.
     */
    async importReply(text){
      if (!window.djAi) return { ok:false, error:'DJ AI not loaded' };
      var parsed = djAi.parseReply(text);
      if (!parsed.items.length) return { ok:false, error:'no playlist found in that text', parsed:0 };
      try {
        await djAi.checkLinks(parsed.items, function(){});
        parsed.items.forEach(function(it){ if (it.dead) it.url = ''; });
        await djAi.resolveMissing(parsed.items, function(){});
        var saved = await djAi.importPlaylist(parsed, text);
        if (!saved) return { ok:false, error:'nothing in that reply could be played',
                             parsed: parsed.items.length, report: djAi.importReport(parsed.items) };
        if (window.plBoss){
          await plBoss.setActivePlaylist(saved.playlistId);
          await plBoss.renderTracks();
          plBoss.renderPlaylists();
        }
        await refreshState();
        publish({ 'data-rr-last-added': saved.count, 'data-rr-last-action': 'importReply' });
        return { ok:true, imported: saved.count, parsed: parsed.items.length,
                 playlist: saved.name, playlistId: saved.playlistId, report: saved.report };
      } catch(e){
        return { ok:false, error:String(e && e.message || e) };
      }
    },

    /**
     * Queue the other tracks by whoever made `ytId` (default: what is
     * playing) right after the playing track. Library first, then the
     * shared catalogue. Returns what it did, never throws.
     */
    async moreFromArtist(ytId){
      if (!window.riffArtist) return { ok:false, error:'not loaded' };
      try {
        var id = ytId ? parseIds(ytId)[0] : (window.player && player.currentYtId);
        var res = await riffArtist.queueMore(id);
        await refreshState();
        return res;
      } catch(e){ return { ok:false, error:String(e && e.message || e) }; }
    },

    /** Play a video already in the playlist, or any id. */
    async play(ytId){
      if (!window.player) return { ok:false, error:'player not ready' };
      if (!ytId){ if (window.plBoss) plBoss.togglePlay(); return { ok:true }; }
      var id = parseIds(ytId)[0];
      if (!id) return { ok:false, error:'not a video id' };
      var t = null;
      try { t = await dbBoss.getTrack(id); } catch(e){}
      player.load(id, (t && t.name) || id);
      await refreshState();
      return { ok:true, playing:id };
    }
  };

  window.riffrolled = api;

  /* ── URL entry points ───────────────────────────────────────────────
     An agent that can only navigate still gets a way in. Both are
     equivalent to a person pasting into the Import panel. */
  function handleUrl(){
    var q = new URLSearchParams(location.search);

    // ?notutorial=1 — skip the first-run tour. Explicit rather than
    // sniffing for automation: navigator.webdriver is both spoofable and
    // occasionally true for real people, and silently changing what
    // somebody sees based on a guess is worse than a flag.
    if (q.get('notutorial') !== null || q.get('agent') !== null){
      try { if (window.tourBoss) tourBoss.dismiss('agent'); } catch(e){}
    }

    var add = q.get('add');
    if (add){
      api.addTracks(add).then(function(res){
        publish({ 'data-rr-url-add': res.added });
        if (window.appToast) appToast('Added ' + res.added + ' track' + (res.added === 1 ? '' : 's'), 'ok');
      });
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(handleUrl, 600); });
  } else {
    setTimeout(handleUrl, 600);
  }

  /* One listener for every source of change, so the published state is
     the same whether a person pressed the button or something called
     the API. The button path fires this event with what it did; reading
     it here means the panels do not each have to know about the
     attributes, and there is one place that decides what is published. */
  window.addEventListener('riffrolled:changed', function(e){
    var d = (e && e.detail) || {};
    if (d.action) publish({ 'data-rr-last-action': d.action });
    if (typeof d.added === 'number') publish({ 'data-rr-last-added': d.added });
    if (typeof d.imported === 'number') publish({ 'data-rr-last-added': d.imported });
    refreshState();
  });

  // first publish once the database is up
  setTimeout(refreshState, 1200);
})();
