/* riffrolled — share.js
   The SHARE key on the deck (right after prev / play / next), and the same
   menu from the share button in a Playlist window.

   Share is sending something to a person: a link to a playlist, or to one
   track. It can also put a playlist in Community for everyone. It is not
   Promote: Promote spends riff credits so strangers see a track; Share
   costs nothing.

     🔗 Send this playlist         one press: makes a link-only mix (in no
                                   list) and copies riffrolled.com/?m=<code>,
                                   or opens the phone's share sheet. Works
                                   straight away. The same playlist with the
                                   same tracks reuses its link.
     ♪  Send the track that's playing   riffrolled.com/?t=<video id>
     🌍 Share to Community…        the Mixes share form (a key's first one
                                   waits for the owner's OK)
     📈 Your shared mixes and their plays

   "This playlist" is the one the menu was opened for: the Playlist window's
   own, or (from the deck) the one playing, else the one on screen. The
   menu shows its name at the top.

   The menu lives in <body> and is placed by measuring: below the button,
   above it, then beside it — the first spot that is fully on screen and
   clear of the YouTube player. If none is, it is squeezed onto the screen
   (scrolling inside) on the side away from the player. On a phone it is a
   sheet along the bottom.

   Opening a track link (?t=) asks first: a note names the track, and only
   "Add it" puts it in a "Shared with me" playlist. Nothing plays until you
   press play. */
var shareBoss = {
  init(){
    var btn = document.getElementById('btnShare');
    var menu = document.getElementById('shareMenu');
    if (!btn || !menu) return;
    this.btn = btn; this.menu = menu;
    document.body.appendChild(menu);           // placed by measuring, see place()
    var self = this;
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      if (!menu.hidden && self.anchor === btn) self.close(); else self.open(btn);
    });
    menu.addEventListener('click', function(e){
      var mi = e.target.closest('.t-mi');
      if (!mi || mi.disabled) return;
      var plId = self.forPl;
      self.close();
      self.act(mi.dataset.s, plId);
    });
    document.addEventListener('click', function(e){
      if (menu.hidden || menu.contains(e.target)) return;
      if (self.anchor && self.anchor.contains(e.target)) return;
      self.close();
    });
    // Escape closes the menu and nothing else (not the window it was opened from)
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && !menu.hidden){ e.preventDefault(); e.stopImmediatePropagation(); var a = self.anchor; self.close(); if (a) a.focus(); }
    }, true);
    window.addEventListener('resize', function(){ if (!menu.hidden) self.place(); });
    this.handleUrl();
  },

  /** the playlist "this playlist" means from the deck: the playing one, else the one on screen */
  playlistId(){
    if (!window.plBoss) return null;
    if (plBoss.playingId && player.currentYtId && plBoss.currentIndex >= 0) return plBoss.playingId;
    return plBoss.activeId || null;
  },

  /** Open the menu at `anchor` (the deck's SHARE key, or a Playlist window's
      share button), for playlist `plId` (default: see playlistId). */
  async open(anchor, plId){
    var menu = this.menu;
    this.anchor = anchor || this.btn;
    var id = plId || this.playlistId();
    var pl = id ? await db.playlists.get(id) : null;
    this.forPl = pl ? pl.id : null;
    var tr = menu.querySelector('[data-s=track]');
    tr.disabled = !player.currentYtId;
    var head = menu.querySelector('.sm-pl');
    head.textContent = pl ? 'Playlist: ' + pl.name : 'No playlist yet — make one to send it';
    head.classList.toggle('none', !pl);
    ['link', 'everyone'].forEach(function(k){ menu.querySelector('[data-s=' + k + ']').disabled = !pl; });
    menu.hidden = false;
    if (this.btn) this.btn.setAttribute('aria-expanded', this.anchor === this.btn ? 'true' : 'false');
    this.place();
  },

  close(){
    this.menu.hidden = true;
    if (this.btn) this.btn.setAttribute('aria-expanded', 'false');
    this.anchor = null;
  },

  /* Below, above, right, left of the button: the first spot fully on screen
     and clear of the player. Failing that, the side with the most room,
     squeezed onto the screen with the list scrolling inside. */
  place(){
    var m = this.menu, a = (this.anchor || this.btn).getBoundingClientRect();
    var W = innerWidth, H = innerHeight, E = 8, G = 10;
    m.classList.remove('pos-sheet', 'squeezed', 'share-float');
    m.style.maxHeight = ''; m.style.left = ''; m.style.top = '';
    if (document.body.classList.contains('mobile')){
      m.classList.add('pos-sheet');
      return;
    }
    m.classList.add('share-float');
    var w = m.offsetWidth, h = m.offsetHeight;
    var v = window.ytGuard && ytGuard.rect();
    var hits = function(x, y, ww, hh){
      return !!v && x < v.right && x + ww > v.left && y < v.bottom && y + hh > v.top;
    };
    var clampX = function(x){ return Math.max(E, Math.min(W - w - E, x)); };
    var clampY = function(y){ return Math.max(E, Math.min(H - h - E, y)); };
    var spots = [
      { x: clampX(a.left), y: a.bottom + G, fits: a.bottom + G + h <= H - E },
      { x: clampX(a.left), y: a.top - G - h, fits: a.top - G - h >= E },
      { x: a.right + G, y: clampY(a.top), fits: a.right + G + w <= W - E },
      { x: a.left - G - w, y: clampY(a.top), fits: a.left - G - w >= E }
    ];
    for (var i = 0; i < spots.length; i++){
      var s = spots[i];
      if (s.fits && !hits(s.x, s.y, w, h)){ m.style.left = Math.round(s.x) + 'px'; m.style.top = Math.round(s.y) + 'px'; return; }
    }
    // nowhere it fits whole: the roomier of below / above, scrolling inside, still off the player
    var below = H - E - (a.bottom + G), above = a.top - G - E;
    var room = Math.max(below, above, 160);
    m.classList.add('squeezed');
    m.style.maxHeight = Math.round(room) + 'px';
    h = Math.min(h, room);
    var y = below >= above ? a.bottom + G : a.top - G - h;
    var x = clampX(a.left);
    if (hits(x, y, w, h) && v){
      // step sideways off the player
      x = (v.right + G + w <= W - E) ? v.right + G : Math.max(E, v.left - G - w);
    }
    m.style.left = Math.round(x) + 'px'; m.style.top = Math.round(clampY(y)) + 'px';
  },

  async act(what, plId){
    if (what === 'track') return this.copyTrack();
    if (what === 'mine'){ if (window.mixesBoss) mixesBoss.openMine(); return; }
    plId = plId || this.playlistId();
    if (!plId){ appNotify('Make or pick a playlist first', 'warn'); return; }
    if (what === 'link') return this.sendPlaylist(plId);
    if (window.mixesBoss) mixesBoss.openShare(plId, { listed: true });
  },

  /* ── Send this playlist: one press, a link that works straight away ── */
  async sendPlaylist(plId){
    var pl = await db.playlists.get(plId);
    if (!pl){ appNotify('That playlist has gone', 'warn'); return; }
    var joins = await db.playlistTracks.where('playlistId').equals(plId).sortBy('order');
    var rows = [];
    for (var i = 0; i < joins.length && rows.length < 50; i++){
      var t = await db.tracks.get(joins[i].trackId);
      if (t && t.ytId && t.playable !== 0) rows.push(t);
    }
    if (!rows.length){ appNotify('“' + pl.name + '” has no tracks to send yet', 'warn'); return; }
    var sig = rows.map(function(t){ return t.ytId; }).join(',');
    if (window.riffUsage) riffUsage.count('share_link');
    // the same tracks as last time: the same link, no new mix
    if (pl.sharedSlug && pl.sharedSig === sig) return this.giveLink(pl.sharedSlug, pl.name);
    appToast('Making a link to “' + pl.name + '”…');
    var tracks = rows.map(function(t){
      return { name: t.name || '', artist: t.artist || '', genre: t.genre || '', url: 'https://www.youtube.com/watch?v=' + t.ytId };
    });
    var send = async function(name){
      var r = await fetch('/api/mixes/share', {
        method: 'POST', headers: Object.assign({ 'content-type':'application/json' }, window.riffWallet ? await riffWallet.headers() : {}),
        body: JSON.stringify({ name: name, listed: false, tracks: tracks })
      });
      var j = null; try { j = await r.json(); } catch(e){}
      return { r: r, j: j || {} };
    };
    try {
      var name = String(pl.name || '').replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 80);
      if (name.length < 3) name = 'A playlist on riffrolled';
      var res = await send(name);
      // a name the server won't show (a link in it, too short): send it under a plain one
      if (res.r.status === 400 && res.j.code === 'bad_name') res = await send('A playlist on riffrolled');
      if (!res.r.ok) throw new Error(res.j.error || ('HTTP ' + res.r.status));
      try { await db.playlists.update(plId, { sharedMixId: res.j.id, sharedSlug: res.j.slug || '', sharedSig: sig }); } catch(e){}
      if (res.j.pending){
        appNotify('Your link to “' + pl.name + '” is made. It starts working once your key has had a quick check.', '');
        return;
      }
      return this.giveLink(res.j.slug, pl.name);
    } catch(e){
      appNotify('Couldn’t make a link: ' + (e && e.message || e), 'warn');
    }
  },

  linkForMix(slug){ return location.origin + '/?m=' + slug; },

  /** hand over a link: the phone's share sheet, else the clipboard — and the
      link stays on screen with a Copy button, in case the clipboard said no */
  async giveLink(slug, name){
    var link = this.linkForMix(slug);
    if (navigator.share && document.body.classList.contains('mobile')){
      try { await navigator.share({ title: name || 'A playlist on riffrolled', text: (name || 'A playlist') + ' — on riffrolled', url: link }); return link; }
      catch(e){ if (e && e.name === 'AbortError') return link; }
    }
    var copied = false;
    try { await navigator.clipboard.writeText(link); copied = true; } catch(e){}
    appNotify((copied ? 'Link copied — paste it to anyone: ' : 'Your link: ') + link.replace(/^https?:\/\//, ''), '', {
      label: copied ? 'Copy again' : 'Copy link',
      run: function(){ return navigator.clipboard.writeText(link).then(function(){ appToast('Link copied', 'ok'); }); }
    });
    document.documentElement.setAttribute('data-rr-last-link', link);
    return link;
  },

  linkForTrack(ytId){ return location.origin + '/?t=' + ytId; },

  async copyTrack(){
    var id = player.currentYtId;
    if (!id) return;
    var link = this.linkForTrack(id);
    if (window.riffUsage) riffUsage.count('share_track');
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
