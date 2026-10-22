/* riffrolled — share.js
   The SHARE key on the deck, right after prev / play / next.

   Share is sending something to a person: a link to a track, or a link to
   a playlist. It can also put a playlist in Community for everyone. It is
   not Promote: Promote spends riff credits so strangers see a track (the
   flyer in the dock); Share costs nothing.

     ♪  Copy a link to this track     riffrolled.com/?t=<video id>
     🔗 Link to this playlist          a link-only mix: in no list, opened by
                                       its link (riffrolled.com/?m=<code>)
     🌍 Share this playlist in Community
     📈 Your shared mixes and their plays

   "This playlist" is the one playing, or else the one in the Playlist
   window. The menu never covers the YouTube player: it tries below the
   key, then the sides, then above (on a phone: a sheet along the bottom,
   above the tab bar), and takes the first spot that is clear of the player
   and on screen.

   Opening a track link (?t=) asks first: a note names the track, and only
   "Add it" puts it in a "Shared with me" playlist. Nothing plays until you
   press play. */
var shareBoss = {
  init(){
    var btn = document.getElementById('btnShare');
    var menu = document.getElementById('shareMenu');
    if (!btn || !menu) return;
    this.btn = btn; this.menu = menu;
    var self = this;
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      if (menu.hidden) self.open(); else self.close();
    });
    menu.addEventListener('click', function(e){
      var mi = e.target.closest('.t-mi');
      if (!mi || mi.disabled) return;
      self.close();
      self.act(mi.dataset.s);
    });
    document.addEventListener('click', function(e){
      if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) self.close();
    });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && !menu.hidden){ self.close(); btn.focus(); }
    });
    this.handleUrl();
  },

  /** the playlist "this playlist" means: the playing one, else the one on screen */
  playlistId(){
    if (!window.plBoss) return null;
    if (plBoss.playingId && player.currentYtId && plBoss.currentIndex >= 0) return plBoss.playingId;
    return plBoss.activeId || null;
  },

  async open(){
    var menu = this.menu;
    var tr = menu.querySelector('[data-s=track]');
    tr.disabled = !player.currentYtId;
    tr.title = player.currentYtId ? '' : 'Nothing is on the deck yet';
    var plId = this.playlistId();
    var pl = plId ? await db.playlists.get(plId) : null;
    ['link', 'everyone'].forEach(function(k){
      var b = menu.querySelector('[data-s=' + k + ']');
      b.disabled = !pl;
      b.title = pl ? '“' + pl.name + '”' : 'Make a playlist first';
    });
    menu.hidden = false;
    this.btn.setAttribute('aria-expanded', 'true');
    this.place();
  },

  close(){
    this.menu.hidden = true;
    this.btn.setAttribute('aria-expanded', 'false');
  },

  /* Below, left, right, above: the first spot on screen and clear of the player. */
  POS: ['pos-below', 'pos-left', 'pos-right', 'pos-above'],
  place(){
    var m = this.menu, self = this;
    var ok = function(){
      var r = m.getBoundingClientRect();
      var on = r.left >= 4 && r.top >= 4 && r.right <= innerWidth - 4 && r.bottom <= innerHeight - 4;
      return on && !(window.ytGuard && ytGuard.overlaps(m));
    };
    var tries = document.body.classList.contains('mobile') ? ['pos-sheet'].concat(this.POS) : this.POS;
    var all = this.POS.concat(['pos-sheet']);
    /* The phone sheet is fixed to the screen, so it lives in <body> while it
       is open: the deck around the key is transformed, and a transformed
       ancestor would pin a "fixed" element to itself instead. */
    var home = this.btn.parentElement;
    var put = function(c){
      all.forEach(function(x){ m.classList.remove(x); });
      m.classList.add(c);
      var want = c === 'pos-sheet' ? document.body : home;
      if (m.parentElement !== want) want.appendChild(m);
    };
    for (var i = 0; i < tries.length; i++){
      put(tries[i]);
      if (ok()) return;
    }
    // nowhere is perfect: never on the player, even if that means off the edge a little
    for (var j = 0; j < tries.length; j++){
      put(tries[j]);
      if (!(window.ytGuard && ytGuard.overlaps(m))) return;
    }
    self.close();
  },

  async act(what){
    if (what === 'track') return this.copyTrack();
    if (what === 'mine'){ if (window.mixesBoss) mixesBoss.openMine(); return; }
    var plId = this.playlistId();
    if (!plId){ appNotify('Make or pick a playlist first', 'warn'); return; }
    if (window.mixesBoss) mixesBoss.openShare(plId, { listed: what !== 'link' });
  },

  linkForTrack(ytId){ return location.origin + '/?t=' + ytId; },

  async copyTrack(){
    var id = player.currentYtId;
    if (!id) return;
    var link = this.linkForTrack(id);
    var title = (player.el && player.el.title && player.el.title.textContent) || 'A track';
    if (navigator.share && document.body.classList.contains('mobile')){
      try { await navigator.share({ title: title, text: title + ' — on riffrolled', url: link }); return; }
      catch(e){ if (e && e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(link);
      appToast('Link copied — ' + link.replace(/^https?:\/\//, ''), 'ok');
    } catch(e){
      appNotify('Copy this link: ' + link, 'ok');
    }
  },

  /* ── opening a track link: riffrolled.com/?t=<id> ── */
  async handleUrl(){
    var id = new URLSearchParams(location.search).get('t');
    if (id === null) return;
    try { history.replaceState(null, '', location.pathname + location.hash); } catch(e){}   // a reload must not add it again
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)){ appNotify('That track link doesn’t look right — it may have been cut short', 'warn'); return; }
    // wait for the Playlist window to know where it is
    var n = 0;
    while (!(window.dock && dock._ready && window.plBoss && plBoss.currentEl) && n++ < 100) await new Promise(function(r){ setTimeout(r, 100); });
    var title = 'Shared track';
    var v = window.djAi && djAi.oembed ? await djAi.oembed(id) : 'offline';
    if (v === null){ appNotify('That video isn’t on YouTube any more, or can’t be played here', 'warn'); return; }
    if (v && v !== 'offline') title = v.name;
    var self = this;
    // a neutral note (not 'ok'), so it waits for an answer instead of fading after a few seconds
    appNotify('Someone shared “' + title + '” with you.', '', { label: 'Add it', run: function(){ setTimeout(function(){ self.addShared(id, title, v); }, 0); } });
  },

  async addShared(id, title, v){
    try {
      var tid = await dbBoss.createTrack(id, title);
      if (v && v !== 'offline' && v.artist){ try { var row = await dbBoss.getTrack(id); if (row && !row.artist) await dbBoss.updateTrackMeta(id, { artist: v.artist.replace(/\s*-\s*Topic$/, '') }); } catch(e){} }
      var pls = await dbBoss.getPlaylists();
      var pl = pls.find(function(p){ return p.source === 'shared'; });
      var plId = pl ? pl.id : await dbBoss.createPl('Shared with me');
      if (!pl) await db.playlists.update(plId, { source: 'shared' });
      await dbBoss.addToPlaylist(plId, tid);
      await plBoss.setActivePlaylist(plId);
      await plBoss.renderTracks();
      plBoss.renderPlaylists();
      if (window.dock) dock.openPanel(plBoss.currentEl);
      appToast('Added “' + title + '” to “Shared with me” — press play when you’re ready.', 'ok');
    } catch(e){ appNotify('Couldn’t add that shared track', 'warn'); }
  }
};

window.addEventListener('load', function(){ shareBoss.init(); });
