/* riffrolled — playlist-windows.js
   Playlists as windows, on a desktop.

   The main Playlist window (plBoss) is where you pick, rename, reorder and
   build playlists. Any other playlist can be opened in a window of its own
   (⧉ in the playlist list), so two or three can sit side by side. Every
   playlist window, the main one included, has a minimize button; a closed
   window is gone, a minimized one is tucked away. Hovering the Playlist
   button in the dock lists the open ones, and a click brings one back to
   the front.

   One playlist plays at a time. Starting a track in a window makes that
   playlist the playing one (plBoss.playFrom), which stops whatever was
   playing before, and every window says whether it is the one playing.
   Closing or minimizing a window never stops the music: the queue lives
   in plBoss, not in a window.

   Phones keep one playlist window. These extra windows are not created
   there, and any that are open are hidden while the layout is mobile. */
var plWins = {
  wins: [],            // { id, el, tracks, minimized }
  mainMin: false,      // the main window was minimized rather than closed

  isDesktop(){ return !(window.dock && dock.mobile); },

  init(){
    this.addMinimize(plBoss.currentEl, function(){ plWins.mainMin = true; dock.setHidden(plBoss.currentEl, true); plWins.renderPop(); });
    // the main window's ✕ is a close, not a minimize
    plBoss.currentEl.querySelector('.panel-close').addEventListener('click', function(){ plWins.mainMin = false; });
    this.addBadge(plBoss.currentEl);
    this.bindDock();
    this.restore();
  },

  /* ── window chrome ── */
  addMinimize(el, onMin){
    var hdr = el.querySelector('.panel-header');
    if (!hdr || hdr.querySelector('.panel-min')) return;
    var b = document.createElement('button');
    b.className = 'panel-min';
    b.title = 'Minimize (the music keeps playing; find it again under the Playlist button)';
    b.setAttribute('aria-label', 'Minimize');
    b.textContent = '–';
    b.addEventListener('click', function(e){ e.stopPropagation(); onMin(); });
    hdr.insertBefore(b, hdr.querySelector('.panel-close'));
  },

  addBadge(el){
    var hdr = el.querySelector('.panel-header');
    if (!hdr || hdr.querySelector('.pl-playing-badge')) return;
    var s = document.createElement('span');
    s.className = 'pl-playing-badge';
    s.textContent = '♪ playing';
    s.hidden = true;
    hdr.insertBefore(s, hdr.querySelector('.panel-min') || hdr.querySelector('.panel-close'));
  },

  find(id){ return this.wins.find(function(w){ return w.id === id; }); },

  /* ── open / close ── */
  async open(id, opts){
    opts = opts || {};
    if (!id) return null;
    if (!this.isDesktop() || id === plBoss.activeId){
      // phones (and the playlist already in the main window) use the main window
      if (id !== plBoss.activeId) await plBoss.setActivePlaylist(id);
      this.showMain();
      return null;
    }
    var w = this.find(id);
    if (w){ this.show(w); return w; }
    var pl = await db.playlists.get(id);
    if (!pl) return null;

    var title = PLAYLIST_SVG.replace(/plg/g, 'plgW' + id) + ' <span class="plw-name">' + escapeHtml(pl.name) + '</span>';
    var el = menuB.createMenu(title,
      '<div class="plw">' +
        '<div class="plw-top">' +
          '<span class="pl-status plw-status">■ Not playing</span>' +
          '<span class="plw-count"></span>' +
          '<button class="icon-btn plw-play" title="Play this playlist from the top" data-testid="plw-play">▶</button>' +
          '<button class="icon-btn plw-main" title="Show it in the main Playlist window instead">⤢</button>' +
        '</div>' +
        '<div class="active-pl-tracks plw-tracks"></div>' +
      '</div>');
    el.classList.add('pl-win');
    el.style.setProperty('--accent', '#9d8cff');      // the Playlist panel's own colour
    el.dataset.pl = String(id);
    el.setAttribute('data-testid', 'pl-win');
    w = { id: id, el: el, tracks: [], minimized: false };
    this.wins.push(w);

    var self = this;
    this.addMinimize(el, function(){ self.minimize(w); });
    this.addBadge(el);
    // its ✕ closes it for good: the window goes, the music does not
    el.querySelector('.panel-close').addEventListener('click', function(e){
      e.stopPropagation();
      self.close(w);
    });
    el.addEventListener('mousedown', function(){ bringToFront(el); });
    el.querySelector('.plw-play').onclick = function(){
      if (w.tracks.length) plBoss.playFrom(w.id, w.tracks, 0);
    };
    el.querySelector('.plw-main').onclick = async function(){
      self.close(w);
      await plBoss.setActivePlaylist(w.id);
      self.showMain();
    };
    el.querySelector('.plw-tracks').addEventListener('click', async function(e){
      var info = e.target.closest('.info-btn');
      if (info){ e.stopPropagation(); if (window.trackInfo) trackInfo.show(info.dataset.yt); return; }
      var del = e.target.closest('.del-btn');
      if (del){
        e.stopPropagation();
        await db.playlistTracks.delete(Number(del.dataset.join));
        await plBoss.refreshAll();
        plBoss.renderPlaylists();
        return;
      }
      var row = e.target.closest('.track-item');
      if (row) plBoss.playFrom(w.id, w.tracks, Number(row.dataset.i));
    });

    // beside the main window, cascading, kept on screen
    var m = plBoss.currentEl.getBoundingClientRect();
    var n = this.wins.length - 1;
    var wdt = 320, hgt = 440;
    var left = opts.left != null ? opts.left : Math.max(8, (m.width ? m.left : innerWidth - 440) - wdt - 14 - n * 26);
    var top = opts.top != null ? opts.top : Math.max(8, (m.height ? m.top : 48) + n * 26);
    left = Math.min(Math.max(0, left), innerWidth - 120);
    top = Math.min(Math.max(0, top), innerHeight - 60);
    menuB.place(el, { left: left + 'px', top: top + 'px', right: 'auto',
                      width: (opts.width || wdt) + 'px', height: (opts.height || hgt) + 'px' });
    if (window.ResizeObserver){ new ResizeObserver(function(){ self.saveSoon(); }).observe(el); }
    el.querySelector('.panel-header').addEventListener('mouseup', function(){ self.saveSoon(); });

    await this.render(w);
    if (opts.minimized) this.minimize(w); else this.show(w);
    this.saveSoon();
    return w;
  },

  show(w){
    w.minimized = false;
    w.el.classList.remove('is-hidden');
    bringToFront(w.el);
    this.renderPop(); this.saveSoon();
  },

  minimize(w){
    w.minimized = true;
    w.el.classList.add('is-hidden');
    this.renderPop(); this.saveSoon();
  },

  close(w){
    w.el.remove();
    this.wins = this.wins.filter(function(x){ return x !== w; });
    this.renderPop(); this.saveSoon();
  },

  /** A playlist was deleted: its window goes too. */
  closeFor(id){
    var w = this.find(id);
    if (w) this.close(w);
  },

  showMain(){
    this.mainMin = false;
    if (window.dock) dock.openPanel(plBoss.currentEl);
    this.renderPop();
  },

  /* ── contents ── */
  async render(w){
    var pl = await db.playlists.get(w.id);
    if (!pl){ this.close(w); return; }
    w.el.querySelector('.plw-name').textContent = pl.name;
    w.tracks = await plBoss.loadTracks(w.id);
    var box = w.el.querySelector('.plw-tracks');
    w.el.querySelector('.plw-count').textContent = '· ' + w.tracks.length + (w.tracks.length === 1 ? ' track' : ' tracks');
    if (!w.tracks.length){
      box.innerHTML = '<div class="empty">No tracks in this playlist yet.</div>';
    } else {
      var promoted = (window.promoTrack && promoTrack.ids) || new Set();
      box.innerHTML = w.tracks.map(function(t, i){
        return '<div class="row-item track-item' + (promoted.has(t.ytId) ? ' is-promoted' : '') + '" data-i="' + i + '" data-yt="' + escapeHtml(t.ytId) + '">' +
          '<span class="track-num">' + (i + 1) + '</span>' +
          '<span class="name">' + (t.artist ? '<span class="track-artist">' + escapeHtml(t.artist) + '</span>' : '') + escapeHtml(t.name) + '</span>' +
          (promoted.has(t.ytId) ? '<span class="promo-tag" title="Promoted: somebody spent riff tokens to put this track in front of people.">promoted</span>' : '') +
          '<button class="info-btn" data-yt="' + escapeHtml(t.ytId) + '" title="Track info">ℹ</button>' +
          '<button class="del-btn" data-join="' + Number(t.joinId) + '" title="Remove from playlist">✕</button>' +
        '</div>';
      }).join('');
    }
    this.syncOne(w);
  },

  async refreshAll(){
    for (var i = 0; i < this.wins.length; i++) await this.render(this.wins[i]);
    this.renderPop();
  },

  /** Which window is playing, and which track: called on every player change. */
  sync(){
    var self = this;
    this.wins.forEach(function(w){ self.syncOne(w); });
    var mb = plBoss.currentEl.querySelector('.pl-playing-badge');
    if (mb) mb.hidden = !(plBoss.playingId === plBoss.activeId && player.currentYtId && plBoss.currentIndex >= 0);
    this.renderPop();
  },

  syncOne(w){
    var playing = plBoss.playingId === w.id && plBoss.currentIndex >= 0 && !!player.currentYtId;
    w.el.classList.toggle('pl-is-playing', playing);
    var b = w.el.querySelector('.pl-playing-badge'); if (b) b.hidden = !playing;
    var st = w.el.querySelector('.plw-status');
    if (st){
      st.textContent = playing ? (player.isPlaying ? '▶ Playing' : '❚❚ Paused') : '■ Not playing';
      st.classList.toggle('on', playing);
    }
    w.el.querySelectorAll('.track-item').forEach(function(r){
      r.classList.toggle('active', playing && r.dataset.yt === player.currentYtId);
    });
  },

  /* ── the dock: hover the Playlist button for the open playlists ── */
  bindDock(){
    var self = this, bar = document.querySelector('.rightM');
    if (!bar) return;
    var pop = document.createElement('div');
    pop.className = 'pl-dock-pop';
    pop.hidden = true;
    pop.setAttribute('data-testid', 'pl-dock-pop');
    document.body.appendChild(pop);
    this.pop = pop;
    var hideT = null;
    var btnOf = function(t){ return t && t.closest && t.closest('[data-testid=dockbtn-playlist]'); };
    var showFor = function(btn){
      if (!self.isDesktop()) return;
      clearTimeout(hideT);
      self.renderPop(true);
      var r = btn.getBoundingClientRect();
      pop.hidden = false;
      var h = pop.offsetHeight;
      pop.style.top = Math.max(8, Math.min(r.top, innerHeight - h - 8)) + 'px';
      pop.style.left = Math.max(8, r.left - pop.offsetWidth - 10) + 'px';
    };
    var hideSoon = function(){ clearTimeout(hideT); hideT = setTimeout(function(){ pop.hidden = true; }, 260); };
    bar.addEventListener('mouseover', function(e){ var b = btnOf(e.target); if (b) showFor(b); });
    bar.addEventListener('mouseout', function(e){ if (btnOf(e.target) && !btnOf(e.relatedTarget)) hideSoon(); });
    bar.addEventListener('focusin', function(e){ var b = btnOf(e.target); if (b) showFor(b); });
    bar.addEventListener('focusout', function(e){ if (btnOf(e.target)) hideSoon(); });
    pop.addEventListener('mouseenter', function(){ clearTimeout(hideT); });
    pop.addEventListener('mouseleave', hideSoon);
    pop.addEventListener('click', async function(e){
      var it = e.target.closest('.pdp-item');
      if (!it) return;
      pop.hidden = true;
      if (it.dataset.main){ self.showMain(); return; }
      var id = Number(it.dataset.id);
      var w = self.find(id);
      if (w) self.show(w);
      else await self.open(id);         // the playing playlist, with no window open
    });
  },

  /** The list behind the dock button: every open window, minimized ones
   *  included, and the playing playlist if its window was closed. */
  async renderPop(force){
    var pop = this.pop;
    if (!pop || (pop.hidden && !force)) return;
    var rows = [];
    var mainOpen = !plBoss.currentEl.classList.contains('is-hidden');
    var names = {};
    var ids = [plBoss.activeId, plBoss.playingId].concat(this.wins.map(function(w){ return w.id; })).filter(Boolean);
    for (var i = 0; i < ids.length; i++){ var p = await db.playlists.get(ids[i]); if (p) names[ids[i]] = p.name; }
    var playing = function(id){ return plBoss.playingId === id && !!player.currentYtId && plBoss.currentIndex >= 0; };
    if (plBoss.activeId && (mainOpen || this.mainMin)){
      rows.push({ main: true, id: plBoss.activeId, name: names[plBoss.activeId], state: mainOpen ? 'main window' : 'minimized', playing: playing(plBoss.activeId) });
    }
    this.wins.forEach(function(w){
      rows.push({ id: w.id, name: names[w.id], state: w.minimized ? 'minimized' : 'window', playing: playing(w.id) });
    });
    if (plBoss.playingId && !rows.some(function(r){ return r.id === plBoss.playingId; }) && playing(plBoss.playingId)){
      rows.push({ id: plBoss.playingId, name: names[plBoss.playingId], state: 'window closed', playing: true });
    }
    pop.innerHTML = '<div class="pdp-h">Open playlists</div>' + (rows.length ? rows.map(function(r){
      return '<button class="pdp-item' + (r.playing ? ' playing' : '') + '"' + (r.main ? ' data-main="1"' : '') + ' data-id="' + Number(r.id) + '">' +
        '<span class="pdp-dot">' + (r.playing ? '♪' : '') + '</span>' +
        '<span class="pdp-name">' + escapeHtml(r.name || 'Playlist') + '</span>' +
        '<span class="pdp-state">' + escapeHtml(r.state) + '</span></button>';
    }).join('') : '<div class="pdp-empty">None open. Click the button to open the Playlist window.</div>') +
      '<div class="pdp-hint">⧉ in the playlist list opens another one in its own window.</div>';
  },

  /* ── remembered between visits ── */
  saveSoon(){
    var self = this;
    clearTimeout(this._saveT);
    this._saveT = setTimeout(function(){ self.save(); }, 400);
  },

  save(){
    if (!window.dbBoss || !this._restored) return;
    var data = this.wins.map(function(w){
      var s = w.el.style;
      return { id: w.id, left: parseInt(s.left, 10) || 0, top: parseInt(s.top, 10) || 0,
               width: parseInt(s.width, 10) || 320, height: parseInt(s.height, 10) || 440, minimized: !!w.minimized };
    });
    dbBoss.setSetting('playlistWindows', JSON.stringify(data));
  },

  async restore(){
    try {
      if (!window.dbBoss || !this.isDesktop()) return;
      var raw = await dbBoss.getSetting('playlistWindows');
      var list = raw ? JSON.parse(raw) : [];
      for (var i = 0; i < list.length; i++){
        var d = list[i];
        if (d && d.id && d.id !== plBoss.activeId && !this.find(d.id) && await db.playlists.get(d.id)){
          await this.open(d.id, { left: d.left, top: d.top, width: d.width, height: d.height, minimized: d.minimized });
        }
      }
    } catch(e){ /* a layout we cannot read is a layout we start again */ }
    finally { this._restored = true; }
  }
};
