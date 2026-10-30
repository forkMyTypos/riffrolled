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

   Every window is the whole Playlist panel, and they all work the same way
   (plBoss.spawn in playlist.js): switch, rename, reorder, share, pick
   several, play. ⧉ New window opens another one, on a new empty playlist. What you add from Tracks, Search or DJ AI goes into the
   playlist window you last clicked in (plBoss.targetId).

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
  _n: 0,

  /** ⧉ New window: another Playlist window, the same as `src` and the same
   *  size, beside it, on a new empty playlist ("New playlist 2"…) with its
   *  name ready to type over. Switch it to any playlist with its search or ▾. */
  async newWindow(src){
    if (!this.isDesktop()){ appNotify('On a phone there is one Playlist window — use ＋ New playlist', ''); return null; }
    var names = new Set((await dbBoss.getPlaylists()).map(function(p){ return p.name; }));
    var name = 'New playlist';
    for (var n = 2; names.has(name); n++) name = 'New playlist ' + n;
    var id = await dbBoss.createPl(name);
    var r = src.currentEl.getBoundingClientRect(), gap = 14;
    var left = r.left - r.width - gap, top = r.top;
    if (left < 8) left = r.right + gap;                              // no room on the left: the right
    if (left + r.width > innerWidth - 60){ left = r.left + 28; top = r.top + 28; }   // no room either side: just offset
    var w = await this.open(id, { left: left, top: top, width: r.width, height: r.height });
    plBoss.renderPlPopup();
    if (w){
      plBoss.lastPanel = w.p;
      var inp = w.el.querySelector('.active-pl-name'); inp.focus(); inp.select();
    }
    return w;
  },

  async open(id, opts){
    opts = opts || {};
    if (!id) return null;
    var copy = opts.restored;          // restored windows come back as they were, even two on one playlist
    if (!this.isDesktop() || (!copy && id === plBoss.activeId)){
      // phones (and the playlist already in the main window) use the main window
      if (id !== plBoss.activeId) await plBoss.setActivePlaylist(id);
      this.showMain();
      return null;
    }
    var w = copy ? null : this.find(id);
    if (w){ this.show(w); return w; }
    if (!(await db.playlists.get(id))) return null;

    /* The same panel as the main Playlist window — menu bar, search and
       switch, rename, Select, the mini transport, the rows with drag to
       reorder, ℹ and ✕ — because it IS that panel: plBoss.spawn() builds
       another copy of it. Only the queue is shared. */
    var p = plBoss.spawn(++this._n);
    var el = p.currentEl;
    el.classList.add('pl-win');
    el.style.setProperty('--accent', '#9d8cff');      // the Playlist panel's own colour
    el.setAttribute('data-testid', 'pl-win');
    w = { p: p, el: el, minimized: false,
          get id(){ return p.activeId; },
          get tracks(){ return p.view; },
          get sel(){ return p.selr; } };
    if (!opts.restored && window.riffUsage) riffUsage.count('playlist_window');      // opened now, not restored
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

    // beside the main window, cascading, kept on screen
    var m = plBoss.currentEl.getBoundingClientRect();
    var n = this.wins.length - 1;
    var wdt = 340, hgt = 520;                          // the main window's size
    var left = opts.left != null ? opts.left : Math.max(8, (m.width ? m.left : innerWidth - 440) - wdt - 14 - n * 26);
    var top = opts.top != null ? opts.top : Math.max(8, (m.height ? m.top : 48) + n * 26);
    left = Math.min(Math.max(0, left), innerWidth - 120);
    top = Math.min(Math.max(0, top), innerHeight - 60);
    menuB.place(el, { left: left + 'px', top: top + 'px', right: 'auto',
                      width: (opts.width || wdt) + 'px', height: (opts.height || hgt) + 'px' });
    if (window.ResizeObserver){ new ResizeObserver(function(){ self.saveSoon(); }).observe(el); }
    el.querySelector('.panel-header').addEventListener('mouseup', function(){ self.saveSoon(); });

    await p.setActivePlaylist(id);
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
    if (w.p.selr){ var s = w.p.selr; PlSelect.all = PlSelect.all.filter(function(x){ return x !== s; }); if (PlSelect.last === s) PlSelect.last = null; }
    if (plBoss.lastPanel === w.p) plBoss.lastPanel = null;
    this.wins = this.wins.filter(function(x){ return x !== w; });
    this.renderPop(); this.saveSoon();
  },

  /** A playlist was deleted: its windows go too. */
  closeFor(id){
    var self = this;
    this.wins.filter(function(w){ return w.id === id; }).forEach(function(w){ self.close(w); });
  },

  showMain(){
    this.mainMin = false;
    if (window.dock) dock.openPanel(plBoss.currentEl);
    this.renderPop();
  },

  /* ── contents ── */
  async render(w){
    if (!w.id || !(await db.playlists.get(w.id))){ this.close(w); return; }
    await w.p.renderTracks();
  },

  async refreshAll(){
    var list = this.wins.slice();
    for (var i = 0; i < list.length; i++) await this.render(list[i]);
    this.renderPop();
  },

  /** Which windows are playing: called on every player change. */
  sync(){
    var playing = function(p){ return plBoss.playingId === p.activeId && plBoss.currentIndex >= 0 && !!player.currentYtId; };
    plBoss.panels().forEach(function(p){
      var b = p.currentEl && p.currentEl.querySelector('.pl-playing-badge');
      if (b) b.hidden = !playing(p);
    });
    this.renderPop();
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
      var w = it.dataset.w != null ? self.wins[Number(it.dataset.w)] : null;
      var id = Number(it.dataset.id);
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
    // the first Playlist window is always listed, even when it is closed (a click opens it again)
    if (plBoss.activeId){
      rows.push({ main: true, id: plBoss.activeId, name: names[plBoss.activeId], state: mainOpen ? 'open' : this.mainMin ? 'minimized' : 'closed', playing: playing(plBoss.activeId) });
    }
    this.wins.forEach(function(w, i){
      rows.push({ w: i, id: w.id, name: names[w.id], state: w.minimized ? 'minimized' : 'open', playing: playing(w.id) });
    });
    if (plBoss.playingId && !rows.some(function(r){ return r.id === plBoss.playingId; }) && playing(plBoss.playingId)){
      rows.push({ id: plBoss.playingId, name: names[plBoss.playingId], state: 'window closed', playing: true });
    }
    pop.innerHTML = '<div class="pdp-h">Open playlists</div>' + (rows.length ? rows.map(function(r){
      return '<button class="pdp-item' + (r.playing ? ' playing' : '') + '"' + (r.main ? ' data-main="1"' : '') + (r.w != null ? ' data-w="' + r.w + '"' : '') + ' data-id="' + Number(r.id) + '">' +
        '<span class="pdp-dot">' + (r.playing ? '♪' : '') + '</span>' +
        '<span class="pdp-name">' + escapeHtml(r.name || 'Playlist') + '</span>' +
        '<span class="pdp-state">' + escapeHtml(r.state) + '</span></button>';
    }).join('') : '<div class="pdp-empty">None open. Click the button to open the Playlist window.</div>') +
      '<div class="pdp-hint">⧉ New window, in any Playlist window, opens another one with a new, empty playlist.</div>';
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
        if (d && d.id && await db.playlists.get(d.id)){
          await this.open(d.id, { restored: true, left: d.left, top: d.top, width: d.width, height: d.height, minimized: d.minimized });
        }
      }
    } catch(e){ /* a layout we cannot read is a layout we start again */ }
    finally { this._restored = true; }
  }
};
