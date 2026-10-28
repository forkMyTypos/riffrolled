/* A note in front of a list — reads as "playlist" at any size, down to 16px.
   The gradient spans the whole 24x24 box (userSpaceOnUse): a gradient sized to
   each shape's own box paints nothing on a perfectly straight line, which is
   why the previous icon's list lines never showed up.
   Each use swaps in its own gradient id (plg → plgD, plgT, plgN): a gradient
   can't be borrowed from an SVG that's hidden, so sharing one is fragile. */
var PLAYLIST_SVG =
  "<svg viewBox='0 0 24 24' aria-hidden='true'>" +
    "<defs><linearGradient id='plg' gradientUnits='userSpaceOnUse' x1='2' y1='3' x2='22' y2='21'>" +
      "<stop offset='0' stop-color='#c3b6ff'/><stop offset='1' stop-color='#46e0ff'/></linearGradient></defs>" +
    "<g stroke='url(#plg)' stroke-width='2' stroke-linecap='round' fill='none'>" +
      "<path d='M3 5.5h13'/><path d='M3 10h9'/><path d='M3 14.5h6' opacity='.9'/></g>" +
    "<ellipse cx='15' cy='18.3' rx='3.3' ry='2.5' fill='url(#plg)' transform='rotate(-22 15 18.3)'/>" +
    "<path d='M18 17.6V8.2c2.3.7 3.6 2.2 3.3 4.6' fill='none' stroke='url(#plg)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>" +
  "</svg>";

var plBoss = {

  /* What plays and what is shown are two different things.
       queue / playingId / currentIndex   the playlist that is PLAYING, and
                                          where in it the deck is
       view / activeId                    the playlist the main Playlist
                                          window is SHOWING
     With one window they are the same playlist, and the queue follows the
     window as it always did. Once something is playing, opening another
     playlist (in this window or in a window of its own, see
     playlist-windows.js) only shows it: the music carries on with the
     playlist it came from until you start a track in the other one. One
     playlist plays at a time, and every window says which. */
  queue: [],
  view: [],
  playingId: null,
  currentIndex: -1,
  /* Picking several tracks to make a new playlist (playlist-select.js);
     `sel` is the main window's picker. */
  selr: null,
  get sel(){ return this.selr; },

  async setup(){
    this.currentM();        // the one merged Playlist panel
    this.bindTransport();
    this.bindKeys();
    this.updateStatus();
    await this.renderPlaylists();   // picks the first playlist if none active
  },

  /* ── TRANSPORT + KEYS ──
     One definition of what play means, used by the deck buttons, the mini
     transport in this panel and the spacebar. The mini row had markup and a
     synced ⏸/▶ glyph but no handler at all, so it looked live and did
     nothing; three copies of the same two lines is how that happens. */
  togglePlay(){
    if (!player.currentYtId && this.view.length) this.playIndex(0);
    else if (!player.currentYtId && this.queue.length) this.playQueue(0);
    else player.toggle();
  },

  bindTransport(){
    player.el.play.onclick = () => this.togglePlay();
    player.el.prev.onclick = () => this.prev();
    player.el.next.onclick = () => this.next();
    this.bindControlMenu();
  },

  bindControlMenu(){
    var btn = document.getElementById('btnCtl');
    var menu = document.getElementById('ctlMenu');
    if (!btn || !menu) return;
    var self = this;

    var close = function(){
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    };
    btn.onclick = function(e){
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
      if (!menu.hidden) self.refreshMoreItem();
    };
    menu.addEventListener('click', function(e){
      var mi = e.target.closest('.t-mi');
      if (!mi) return;
      if (mi.dataset.a === 'again'){ self.playAgain(); close(); return; }
      if (mi.dataset.a === 'more'){ self.moreFromArtist(); close(); return; }
      if (mi.dataset.r){ self.setRepeat(mi.dataset.r); close(); }
    });
    // a menu that only closes via its own button is a menu you fight
    document.addEventListener('click', function(e){
      if (menu.hidden) return;
      if (!menu.contains(e.target) && e.target !== btn) close();
    });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && !menu.hidden) close();
    });

    this.loadRepeat();
  },

  /* "More from <artist>" in the ⋯ menu: shown only when riffrolled can
     name the artist of what is playing, and says how many it already has. */
  async refreshMoreItem(){
    var mi = document.querySelector('#ctlMenu [data-a="more"]');
    if (!mi || !window.riffArtist) return;
    var ytId = player.currentYtId;
    mi.hidden = true;
    if (!ytId) return;
    try {
      var info = await riffArtist.localOthers(ytId);
      if (player.currentYtId !== ytId || !info.artist) return;
      mi.querySelector('.t-mi-txt').textContent = info.rows.length
        ? 'More from ' + info.artist + ' · ' + info.rows.length + ' in your library'
        : 'Find more from ' + info.artist;
      mi.hidden = false;
    } catch(e){}
  },

  async moreFromArtist(){
    if (!window.riffArtist || !player.currentYtId) return;
    var res;
    try { res = await riffArtist.queueMore(player.currentYtId); }
    catch(e){ res = { ok:false, message:'That didn’t work: ' + (e && e.message || e) }; }
    if (window.appToast) appToast(res.message, res.ok ? 'ok' : '');
    document.documentElement.setAttribute('data-rr-last-action', 'moreFromArtist');
  },

  bindKeys(){
    document.addEventListener('keydown', (e)=>{
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.code === 'Space'){ e.preventDefault(); player.el.play.onclick(); }
      else if (e.code === 'ArrowRight'){ this.next(); }
      else if (e.code === 'ArrowLeft'){ this.prev(); }
    });
  },

  /** Play track i of the playlist the main window is showing. Starting a
   *  track is what makes a playlist the playing one. */
  playIndex(i){
    if (i < 0 || i >= this.view.length) return;
    this.playFrom(this.activeId, this.view, i);
  },

  /** Make `tracks` (playlist `plId`) the queue and play track i of it. */
  playFrom(plId, tracks, i){
    if (!tracks || i < 0 || i >= tracks.length) return;
    this.queue = tracks.slice();
    this.playingId = plId;
    this.playQueue(i);
  },

  /** Play track i of the queue. next, prev and the end of a track use this. */
  playQueue(i){
    if (i < 0 || i >= this.queue.length) return;
    this.currentIndex = i;
    const t = this.queue[i];
    player.load(t.ytId, t.name);
    this.syncHighlight();
    this.updateStatus();
  },

  /* ── what happens when a track ends ─────────────────────────────────
     next() is two different questions wearing one name, and conflating
     them is why there was no way to stop at the end of a playlist:

       next()      the listener pressed ⏭. Always go to the next track,
                   wrapping, whatever the repeat mode says — pressing
                   next and having nothing happen is a broken button.
       advance()   the track ended by itself. NOW the repeat mode decides.

     Before this, ENDED called next() directly, so riffrolled had exactly
     one behaviour: loop the playlist forever, with no way to replay one
     track and no way to let a playlist finish. */

  repeat: 'all',            // 'all' | 'one' | 'off'

  async loadRepeat(){
    try {
      var v = await dbBoss.getSetting('repeatMode');
      if (v === 'all' || v === 'one' || v === 'off') this.repeat = v;
    } catch(e){ /* the default is fine */ }
    this.syncRepeatUi();
  },

  setRepeat(mode){
    if (['all', 'one', 'off'].indexOf(mode) < 0) return;
    this.repeat = mode;
    if (window.dbBoss) dbBoss.setSetting('repeatMode', mode);
    this.syncRepeatUi();
  },

  syncRepeatUi(){
    var menu = document.getElementById('ctlMenu');
    var btn = document.getElementById('btnCtl');
    if (menu){
      menu.querySelectorAll('[data-r]').forEach((b) => {
        var on = b.dataset.r === this.repeat;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    }
    /* The transport button carries the current mode, so the setting is
       visible without opening the menu — otherwise "why did it stop?"
       has no answer on screen. */
    if (btn){
      var why = { all:'Repeat: whole playlist', one:'Repeat: this one track',
                  off:'Repeat off — stops at the end' }[this.repeat];
      // a rotary selector: the pointer and the lit label show the mode
      btn.dataset.mode = this.repeat;
      if (btn.parentNode) btn.parentNode.dataset.mode = this.repeat;
      btn.setAttribute('aria-label', why + ' — replay options');
      btn.title = why + ' · click for replay options';
      btn.classList.toggle('on', this.repeat !== 'all');
    }
  },

  /** Start the current track over from the beginning. */
  playAgain(){
    var t = this.queue[this.currentIndex];
    if (!t){ if (this.queue.length) this.playQueue(0); return; }
    player.load(t.ytId, t.name);
  },

  /** The track finished on its own. */
  advance(){
    if (!this.queue.length) return;
    if (this.repeat === 'one'){ this.playAgain(); return; }
    var last = this.currentIndex >= this.queue.length - 1;
    if (last && this.repeat === 'off'){
      // let it stop, but leave the deck on the track that just played so
      // pressing play starts it again rather than doing nothing
      player.setPlaying(false);
      if (window.appNotify) appNotify('End of the playlist — repeat is off', 'ok');
      return;
    }
    this.playQueue((this.currentIndex + 1) % this.queue.length);
  },

  next(){ if (this.queue.length) this.playQueue((this.currentIndex + 1) % this.queue.length); },
  prev(){ if (this.queue.length) this.playQueue((this.currentIndex - 1 + this.queue.length) % this.queue.length); },

  /* ── a track YouTube has permanently refused ──────────────────────────
     Say what happened, take it out of this playlist, and offer it back.
     Only this listener's playlist: nothing is removed from anyone else's,
     and the track row, its play history, its tags and its links all stay —
     PLAY_ORDER links live in their own table, so they survive the join row
     going. The one thing that changes is SAME_PLAYLIST, which is derived
     live from playlistTracks, and that is correct: it isn't in the
     playlist any more. */
  async dropUnplayable(ytId, reason){
    const row = this.queue.find(t => t.ytId === ytId);
    const joinId = row && row.joinId;
    const name = (row && row.name) || ytId;
    const plId = this.playingId || this.activeId;

    if (joinId != null) await db.playlistTracks.delete(joinId);
    await this.refreshAll();

    const msg = (reason || 'That video can’t be played') + ' — removed “' + name + '” from this playlist.';
    if (window.appNotify){
      appNotify(msg, 'warn', joinId == null ? null : {
        label: 'Undo',
        run: async () => {
          // put it back where it was, and let it be tried again
          const t = await dbBoss.getTrack(ytId);
          if (t && plId){
            await dbBoss.addToPlaylist(plId, t.id);
            await dbBoss.clearPlayable(ytId);
            await this.refreshAll();
          }
        },
      });
    }
  },

  syncHighlight(){
    const c = this.currentEl.querySelector('.active-pl-tracks');
    const here = this.playingId === this.activeId;
    if (c) c.querySelectorAll('.track-item').forEach(el=>{
      el.classList.toggle('active', here && el.dataset.yt === player.currentYtId);
    });
    if (window.plWins) plWins.sync();
  },

  updateStatus(){
    if (!this.currentEl) return;
    const mini = this.currentEl.querySelector('.mini-play');
    if (mini) mini.textContent = player.isPlaying ? '⏸' : '▶';
    const el = this.currentEl.querySelector('.pl-status');
    if (!el) return;
    if (!player.currentYtId){
      el.textContent = '■ Stopped'; el.style.color = 'rgba(255,255,255,0.4)'; return;
    }
    const inThis = this.playingId === this.activeId && this.queue.some(t => t.ytId === player.currentYtId);
    this.currentEl.classList.toggle('pl-is-playing', inThis);
    if (window.plWins) plWins.sync();
    if (player.isPlaying){
      el.textContent = inThis ? '▶ Playing' : '▶ Playing (another playlist)';
      el.style.color = '#5ab88a';
    } else {
      el.textContent = '❚❚ Paused'; el.style.color = '#d8a657';
    }
  },

  msg(text, kind){
    const m = this.currentEl && this.currentEl.querySelector('.active-pl-msg');
    if (!m) return;
    m.textContent = text || '';
    m.style.color = kind === 'err' ? '#d46060' : kind === 'ok' ? '#5ab88a' : 'rgba(255,255,255,0.45)';
    if (text){ clearTimeout(this._msgT); this._msgT = setTimeout(()=>{ if (m.textContent === text) m.textContent=''; }, 4000); }
  },

  // re-render everything that can change after a DB write
  afterDbChange(){
    this.refreshAll();
    this.renderPlaylists();
    if (window.searchBoss) searchBoss.render();
  },

  /** Redraw the main window, reload the playing queue if it is another
   *  playlist, and redraw any playlist windows. */
  async refreshAll(){
    await this.renderTracks();
    if (this.playingId && this.playingId !== this.activeId) await this.refreshQueue();
    if (window.plWins) await plWins.refreshAll();
  },

  /** A playlist's playable tracks, in order, as queue rows. */
  async loadTracks(plId){
    if (!plId) return [];
    const joins = await db.playlistTracks.where('playlistId').equals(plId).sortBy('order');
    if (!joins.length) return [];
    const tracks = await db.tracks.bulkGet(joins.map(j => j.trackId));
    // `.filter(Boolean)` drops joins whose track row has gone; `playable !== 0`
    // drops the ones YouTube has permanently refused. A dead track is removed
    // from the playlist when it fails, so this is the belt to that braces —
    // it also covers tracks marked dead on another device, or restored from
    // a backup that already knew.
    return tracks
      .map((t, i) => t ? { ytId: t.ytId, name: t.name, artist: t.artist || '', joinId: joins[i].id, trackId: joins[i].trackId, playable: t.playable } : null)
      .filter(t => t && t.playable !== 0);
  },

  /** The playing playlist changed in the database: reload the queue and
   *  find the playing track in it again. */
  async refreshQueue(){
    if (!this.playingId) return;
    const pl = await db.playlists.get(this.playingId);
    if (!pl){ this.playingId = null; return; }        // deleted: the queue plays on until something else starts
    this.queue = await this.loadTracks(this.playingId);
    this.currentIndex = this.queue.findIndex(t => t.ytId === player.currentYtId);
  },

  /* ── PLAYLIST PANEL (merged: pick/search/create + current playlist) ── */
  currentM(){
    var title = PLAYLIST_SVG.replace(/plg/g, 'plgT') + ' Playlist';
    var main = `
      <div class="active-pl">

        <!-- the menu bar: make, open beside, share -->
        <div class="pl-menubar" role="toolbar" aria-label="Playlist actions">
          <button class="pl-mb pl-add" data-testid="pl-new" title="Start a new, empty playlist">＋ New playlist</button>
          <button class="pl-mb pl-beside" data-testid="pl-beside" title="Open a playlist in its own window, beside this one">⧉ New window</button>
          <button class="pl-mb pl-share" data-testid="pl-share" title="Send this playlist to someone, or share it to Community"><img class="share-ico" src="img/share-icon.webp" alt="" width="14" height="14" draggable="false"> Share</button>
        </div>

        <div class="pl-toolbar">
          <div class="pl-srh-wrap">
            <input type="text" class="pl-srh" placeholder="🔍 Find or switch playlist…" aria-label="Find or switch playlist">
            <div class="pl-pop scrollable"></div>
          </div>
        </div>

        <div class="active-pl-header">
          <span class="pl-status">■ Stopped</span>
        </div>

        <div class="active-pl-name-row">
          <span class="pl-name-icon">${PLAYLIST_SVG.replace(/plg/g, 'plgN')}</span>
          <input type="text" class="active-pl-name" value="No playlist" title="Rename this playlist" aria-label="Playlist name">
          <button class="icon-btn pl-switch" title="Switch playlist" aria-label="Switch playlist" aria-haspopup="listbox" data-testid="pl-switch">▾</button>
        </div>

        <div class="active-pl-sub">
          <span title="Pick several: Shift + ↓ / ↑, or Shift + click (Ctrl + click adds one). Then make a new playlist from them.">Tracks</span><span class="count">· 0</span>
          <button class="icon-btn add-track-btn" title="Add tracks (opens the Tracks panel)">＋</button>
          <button class="pl-select" data-testid="pl-select" aria-pressed="false" title="Pick several tracks to make a new playlist from them (or Shift + click, Shift + ↓)">☑ Select</button>
          <div class="mini-transport">
            <button class="icon-btn mini-prev" title="Previous">⏮</button>
            <button class="icon-btn mini-play" title="Play / pause">▶</button>
            <button class="icon-btn mini-next" title="Next">⏭</button>
          </div>
        </div>

        <div class="active-pl-msg"></div>

        <div class="active-pl-tracks"></div>



      </div>
    `;
    this.currentEl = menuB.createMenu(title, main);
    menuB.place(this.currentEl, { right:'92px', top:'48px', width:'340px', height:'520px' });

    // dynamic "Playlist — {name}" in the header
    const hdr = this.currentEl.querySelector('.panel-header');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'pl-title-name';
    hdr.insertBefore(nameSpan, hdr.querySelector('.panel-close'));

    this.bindCurrentEvents();
    this.selr = new PlSelect({
      root: this.currentEl,
      list: this.currentEl.querySelector('.active-pl-tracks'),
      view: () => this.view,
      name: () => this.currentEl.querySelector('.active-pl-name').value,
      playlistId: () => this.activeId,
      open: (id) => this.setActivePlaylist(id),
      onMode: (on) => {
        const b = this.currentEl.querySelector('.pl-select');
        if (b){ b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      },
    });
    this.currentEl.querySelector('.pl-select').onclick = () => this.selr.setMode(!this.selr.mode);
  },

  setTitleName(name){
    const s = this.currentEl.querySelector('.pl-title-name');
    if (s) s.textContent = name ? ' — ' + name : '';
  },

  bindCurrentEvents(){
    const root   = this.currentEl;

    // ── mini transport ── delegated, so re-rendering the panel can't lose it
    root.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('.mini-prev, .mini-play, .mini-next');
      if (!b) return;
      if (b.classList.contains('mini-prev')) this.prev();
      else if (b.classList.contains('mini-next')) this.next();
      else this.togglePlay();
    });

    // ── playlist search popup ──
    const srh = root.querySelector('.pl-srh');
    const pop = root.querySelector('.pl-pop');
    const openPop = () => { pop.style.top = ''; pop.classList.add('open'); this.renderPlPopup(); };
    srh.addEventListener('focus', () => { pop.classList.remove('win-mode'); openPop(); });
    srh.addEventListener('input', () => { pop.style.top = ''; pop.classList.add('open'); this.renderPlPopup(); });
    document.addEventListener('click', (e) => {
      if (!e.target.closest || !e.target.closest('.pl-srh-wrap')) pop.classList.remove('open');
    });
    // one delegated handler: pick a playlist, or delete one
    pop.addEventListener('click', async (e) => {
      const del = e.target.closest('.del-btn');
      if (del){ e.stopPropagation(); await this.deletePlaylist(Number(del.dataset.id)); this.renderPlPopup(); return; }
      if (e.target.closest('.pl-new-win')){
        e.stopPropagation();
        pop.classList.remove('open', 'win-mode'); srh.value = '';
        const names = new Set((await dbBoss.getPlaylists()).map(p => p.name));
        let name = 'New playlist';
        for (let n = 2; names.has(name); n++) name = 'New playlist ' + n;
        const nid = await dbBoss.createPl(name);
        await this.renderPlaylists();
        if (window.plWins) await plWins.open(nid);
        return;
      }
      const win = e.target.closest('.pl-open-win');
      if (win){
        e.stopPropagation();
        pop.classList.remove('open'); srh.value = '';
        if (window.plWins) await plWins.open(Number(win.dataset.id));
        return;
      }
      const item = e.target.closest('.pl-item');
      if (item){
        const winMode = pop.classList.contains('win-mode');
        pop.classList.remove('open', 'win-mode');
        srh.value = '';
        if (winMode && window.plWins && Number(item.dataset.id) !== this.activeId) await plWins.open(Number(item.dataset.id));
        else await this.setActivePlaylist(Number(item.dataset.id));
      }
    });

    // ── ⧉ next to the name: the same list, but a pick opens in its own window ──
    root.querySelector('.pl-beside').onclick = (e) => {
      e.stopPropagation();
      const was = pop.classList.contains('open') && pop.classList.contains('win-mode');
      pop.classList.remove('open', 'win-mode');
      if (was) return;
      srh.value = '';
      const w = root.querySelector('.pl-srh-wrap').getBoundingClientRect();
      const nr = root.querySelector('.active-pl-name-row').getBoundingClientRect();
      pop.style.top = Math.round(nr.bottom - w.top + 4) + 'px';
      pop.classList.add('open', 'win-mode');
      this.renderPlPopup();
    };

    // ── ▾ next to the name: the list of playlists, to switch ──
    root.querySelector('.pl-switch').onclick = (e) => {
      e.stopPropagation();
      pop.classList.remove('win-mode');
      if (pop.classList.contains('open')){ pop.classList.remove('open'); return; }
      srh.value = '';
      // drop the list down from the name row rather than from the search box
      const w = root.querySelector('.pl-srh-wrap').getBoundingClientRect();
      const nr = root.querySelector('.active-pl-name-row').getBoundingClientRect();
      pop.style.top = Math.round(nr.bottom - w.top + 4) + 'px';
      pop.classList.add('open'); this.renderPlPopup();
    };

    // ── ↗ share this playlist as a mix (opens the Mixes panel's share sheet) ──
    root.querySelector('.pl-share').onclick = (e) => {
      e.stopPropagation();
      if (!this.activeId){ appNotify('Pick a playlist to share first', 'warn'); return; }
      if (window.shareBoss && shareBoss.menu) shareBoss.open(e.currentTarget, this.activeId);
      else if (window.mixesBoss) mixesBoss.openShare(this.activeId);
    };

    // ── ＋ new playlist (uses the search text as the name if present) ──
    root.querySelector('.pl-add').onclick = async () => {
      // a blank one, numbered so a second "New playlist" can be told apart
      let name = srh.value.trim();
      if (!name){
        const names = new Set((await dbBoss.getPlaylists()).map(p => p.name));
        name = 'New playlist';
        for (let n = 2; names.has(name); n++) name = 'New playlist ' + n;
      }
      const id = await dbBoss.createPl(name);
      srh.value = '';
      pop.classList.remove('open');
      await this.setActivePlaylist(id);
      const nameInput = root.querySelector('.active-pl-name');
      nameInput.focus(); nameInput.select();     // invite an immediate rename
    };

    // ── ＋ add tracks → open the Tracks panel ──
    root.querySelector('.add-track-btn').onclick = () => {
      if (window.dock && window.importBoss) dock.openPanel(importBoss.el);
    };

  },


  // popup list of playlists, filtered by the search box
  async renderPlPopup(){
    const root = this.currentEl;
    const pop = root.querySelector('.pl-pop');
    if (!pop || !pop.classList.contains('open')) return;
    const q = (root.querySelector('.pl-srh').value || '').trim().toLowerCase();
    const pls = await dbBoss.getPlaylists();
    const shown = q ? pls.filter(p => p.name.toLowerCase().includes(q)) : pls;
    const winMode = pop.classList.contains('win-mode');
    const head = winMode
      ? `<div class="pl-pop-h" data-testid="pl-beside-h">Open in a new window, beside this one</div>` +
        `<button class="row-item pl-new-win" data-testid="pl-new-win">＋ A new, empty playlist</button>`
      : '';
    if (!shown.length){
      pop.innerHTML = head + `<div class="empty">${pls.length ? 'No matches' : 'No playlists yet — hit ＋ New playlist'}</div>`;
      return;
    }
    const counts = {};
    await Promise.all(shown.map(async pl=>{ counts[pl.id] = await dbBoss.countTracks(pl.id); }));
    pop.innerHTML = head + shown.filter(pl => !winMode || pl.id !== this.activeId).map(pl => `
      <div class="row-item pl-item ${pl.id === this.activeId ? 'active' : ''}" data-id="${pl.id}">
        <span class="name pl-item-name">${escapeHtml(pl.name)}</span>
        <span class="pl-item-count">${counts[pl.id]}</span>
        ${ pl.id !== this.activeId ? `<button class="pl-open-win" data-id="${pl.id}" title="Open in its own window" aria-label="Open in its own window">⧉</button>` : '' }
        <button class="del-btn" data-id="${pl.id}" title="Delete playlist">✕</button>
      </div>
    `).join('');
  },

  // kept name: everything that used to refresh the Playlists panel calls this
  async renderPlaylists(){
    this.renderPlPopup();
    if (!this.activeId){
      const pls = await dbBoss.getPlaylists();
      if (pls.length) await this.setActivePlaylist(pls[0].id);
      else this.setTitleName('');
    }
  },

  async deletePlaylist(id){
    await db.playlists.delete(id);
    const joins = await db.playlistTracks.where('playlistId').equals(id).toArray();
    await db.playlistTracks.bulkDelete(joins.map(j => j.id));
    if (this.activeId === id) this.activeId = null;
    if (this.playingId === id) this.playingId = null;
    if (window.plWins) plWins.closeFor(id);

    if (!this.activeId){
      const remaining = await dbBoss.getPlaylists();
      if (remaining.length){
        await this.setActivePlaylist(remaining[0].id);
      } else {
        this.setTitleName('');
        this.currentEl.querySelector('.active-pl-name').value = 'No playlist';
        this.currentEl.querySelector('.active-pl-tracks').innerHTML = `<div class="empty">No playlist selected</div>`;
        this.currentEl.querySelector('.active-pl-sub .count').textContent = '· 0';
        this.view = [];
        if (!this.playingId){ this.queue = []; this.currentIndex = -1; }
        this.updateStatus();
      }
    }
  },


  /* ── STATE ── */
  async setActivePlaylist(id){
    if (id !== this.activeId && this.selr) this.selr.clear();
    this.activeId = id;
    const pl = await db.playlists.get(id);
    if (!pl) return;

    this.setTitleName(pl.name);
    const nameInput = this.currentEl.querySelector('.active-pl-name');
    nameInput.value = pl.name;
    nameInput.onchange = async () => {
      const newName = nameInput.value.trim();
      if(!newName) return;
      await db.playlists.update(id, { name: newName });
      this.setTitleName(newName);
      this.renderPlPopup();
    };

    if (window.searchBoss) searchBoss.render();
    this.renderTracks();
  },

  /* ── TRACKS (ordered + drag-reorderable) ── */
  async renderTracks(){
    const container = this.currentEl.querySelector('.active-pl-tracks');
    const countEl = this.currentEl.querySelector('.active-pl-sub .count');

    this.view = this.activeId ? await this.loadTracks(this.activeId) : [];
    /* The queue follows this window unless a track from another playlist
       is playing. (A track started from somewhere that is not a playlist —
       a search result, a promoted card — belongs to no queue, so the
       window takes over again.) */
    const elsewhere = this.playingId && this.playingId !== this.activeId &&
      player.currentYtId && this.queue.some(t => t.ytId === player.currentYtId);
    if (!elsewhere){ this.queue = this.view; this.playingId = this.activeId; }
    this.currentIndex = this.queue.findIndex(t => t.ytId === player.currentYtId);

    if(!this.activeId){
      container.innerHTML = `<div class="empty">No playlist selected</div>`;
      countEl.textContent = '· 0';
      if (this.selr) this.selr.paint();
      this.updateStatus();
      return;
    }

    const njoins = await db.playlistTracks.where('playlistId').equals(this.activeId).count();
    countEl.textContent = '· ' + njoins;

    if(!this.view.length){
      container.innerHTML = `<div class="empty">No tracks yet.<br>Hit ＋ above to add from your library.</div>`;
      if (this.selr) this.selr.paint();
      this.updateStatus();
      return;
    }

    /* Promoted tracks are marked wherever they appear, including here.
       This is not decoration. A track can reach a playlist as a paid
       placement — offered in a DJ brief, or added from the Promoted strip
       — and once it is in the queue it looks exactly like a track the
       listener chose. Saying so is the disclosure, and it has to live at
       the point of play rather than only at the point of offer, because
       that is where somebody actually listens to it.

       promoTrack.ids is the live promoted set, refreshed from
       /api/promotions. If that fetch failed the set is empty and nothing
       is labelled, which is the one failure mode worth noting: the badge
       is best-effort, so it must never be the only disclosure. The DJ
       brief says it in words too. */
    const promoted = (window.promoTrack && promoTrack.ids) || new Set();

    container.innerHTML = this.view.map((t, i)=>`
      <div class="row-item track-item${ promoted.has(t.ytId) ? ' is-promoted' : '' }" data-i="${i}" data-yt="${escapeHtml(t.ytId)}" draggable="true">
        <span class="track-handle" title="Drag to reorder">⠿</span>
        <span class="track-num">${i+1}</span>
        ${ t.ytId === player.currentYtId ? `<span class="now-dot">♪</span>` : '' }
        <span class="name">${ t.artist ? `<span class="track-artist">${escapeHtml(t.artist)}</span>` : '' }${escapeHtml(t.name)}</span>
        ${ promoted.has(t.ytId) ? `<span class="promo-tag" title="Promoted: somebody spent riff tokens to put this track in front of people. It is in your playlist because you or your AI chose to add it.">promoted</span>` : '' }
        <button class="info-btn" data-yt="${escapeHtml(t.ytId)}" title="Track info — title, artist, tags">ℹ</button>
        <button class="del-btn" data-join="${t.joinId}" title="Remove from playlist">✕</button>
      </div>
    `).join('');

    // play on click
    container.querySelectorAll('.track-item').forEach(el=>{
      el.onclick = (e) => {
        // the info button opens the panel for THIS track rather than
        // playing it — the whole point is reading about a track you are
        // not listening to
        const info = e.target.closest('.info-btn');
        if (info){
          e.stopPropagation();
          if (window.trackInfo) trackInfo.show(info.dataset.yt);
          return;
        }
        if (e.target.classList.contains('del-btn') || e.target.classList.contains('track-handle')) return;
        const i = Number(el.dataset.i);
        // picking several tracks (Shift / Ctrl + click, or taps after a long-press) doesn't play
        if (this.selr && this.selr.rowClick(e, i)) return;
        this.playIndex(i);
      };
    });

    // remove
    container.querySelectorAll('.del-btn').forEach(btn=>{
      btn.onclick = async (e)=>{
        e.stopPropagation();
        await db.playlistTracks.delete(Number(btn.dataset.join));
        await this.refreshAll();
        this.renderPlaylists();
        if (window.searchBoss) searchBoss.render();
      };
    });

    // drag-to-reorder (mouse: native HTML5 DnD)
    let dragFrom = null;
    container.querySelectorAll('.track-item').forEach(el=>{
      el.addEventListener('dragstart', (e)=>{ dragFrom = Number(el.dataset.i); el.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
      el.addEventListener('dragend',   ()=>{ el.classList.remove('dragging'); container.querySelectorAll('.track-item').forEach(x=>x.classList.remove('drop-into')); });
      el.addEventListener('dragover',  (e)=>{ e.preventDefault(); el.classList.add('drop-into'); });
      el.addEventListener('dragleave', ()=> el.classList.remove('drop-into'));
      el.addEventListener('drop', async (e)=>{
        e.preventDefault();
        el.classList.remove('drop-into');
        const to = Number(el.dataset.i);
        if (dragFrom === null || dragFrom === to) return;
        await this.reorder(dragFrom, to);
        dragFrom = null;
      });
    });

    // drag-to-reorder (touch / pen: native DnD doesn't fire, so drive it from the handle with pointer events)
    const self = this;
    let pFrom = null, pOver = null;
    const clearMarks = () => container.querySelectorAll('.track-item').forEach(x=>x.classList.remove('drop-into'));
    const onPMove = (ev) => {
      if (pFrom === null) return;
      ev.preventDefault();
      const over = document.elementFromPoint(ev.clientX, ev.clientY);
      const it = over && over.closest ? over.closest('.track-item') : null;
      clearMarks();
      if (it && Number(it.dataset.i) !== pFrom){ it.classList.add('drop-into'); pOver = Number(it.dataset.i); }
      else pOver = null;
    };
    const onPUp = async () => {
      document.removeEventListener('pointermove', onPMove);
      document.removeEventListener('pointerup', onPUp);
      document.removeEventListener('pointercancel', onPUp);
      container.querySelectorAll('.track-item').forEach(x=>x.classList.remove('dragging'));
      clearMarks();
      const from = pFrom, to = pOver;
      pFrom = pOver = null;
      if (from !== null && to !== null && to !== from) await self.reorder(from, to);
    };
    container.querySelectorAll('.track-item').forEach(el=>{
      const handle = el.querySelector('.track-handle');
      if (!handle) return;
      handle.addEventListener('pointerdown', (e)=>{
        if (e.pointerType === 'mouse') return;   // desktop mouse keeps native drag-and-drop
        e.preventDefault();
        pFrom = Number(el.dataset.i); pOver = null;
        el.classList.add('dragging');
        document.addEventListener('pointermove', onPMove, { passive:false });
        document.addEventListener('pointerup', onPUp);
        document.addEventListener('pointercancel', onPUp);
      });
    });

    this.syncHighlight();
    if (this.selr) this.selr.paint();
    this.updateStatus();
  },

  /**
   * Make these tracks the ones that play next, in order, right after
   * `afterYtId`. Tracks already in the playlist are moved up beside it
   * rather than duplicated; new ones are added. If the playing track is not
   * in the active playlist (or there is none) they go into a new playlist
   * of their own, headed by the playing track, so "next" is still true.
   * Returns how many tracks are now queued behind it.
   */
  async queueAfterCurrent(afterYtId, ytIds, label){
    const rows = [];
    for (const id of ytIds){ const t = await dbBoss.getTrack(id); if (t) rows.push(t); }
    const cur = await dbBoss.getTrack(afterYtId);
    if (!cur || !rows.length) return 0;

    // the playlist the playing track came from, else the one on screen
    let plId = (this.playingId && this.queue.some(t => t.ytId === afterYtId)) ? this.playingId : this.activeId;
    let joins = plId ? await db.playlistTracks.where('playlistId').equals(plId).sortBy('order') : [];
    let at = joins.findIndex(j => j.trackId === cur.id);

    if (!plId || at < 0){
      plId = await dbBoss.createPl('More from ' + (label || 'this artist'));
      await dbBoss.addToPlaylist(plId, cur.id);
      joins = await db.playlistTracks.where('playlistId').equals(plId).sortBy('order');
      at = 0;
      await this.setActivePlaylist(plId);
    }

    const wanted = new Set(rows.map(r => r.id));
    const curJoin = joins[at];
    const rest = joins.filter(j => j !== curJoin && !wanted.has(j.trackId));
    const before = joins.slice(0, at).filter(j => !wanted.has(j.trackId));
    const after = rest.slice(before.length);
    const have = new Map(joins.filter(j => wanted.has(j.trackId)).map(j => [j.trackId, j]));

    const order = [...before, curJoin];
    for (const r of rows){
      let j = have.get(r.id);
      if (!j){
        const newId = await db.playlistTracks.add({ playlistId: plId, trackId: r.id, addedAt: Date.now(), order: 9e6 });
        j = { id: newId, trackId: r.id };
      }
      order.push(j);
    }
    order.push(...after);
    await Promise.all(order.map((j, i) => db.playlistTracks.update(j.id, { order: i })));
    await this.refreshAll();
    this.renderPlaylists();
    return rows.length;
  },

  async reorder(from, to){
    const list = this.view.slice();
    const moved = list.splice(from, 1)[0];
    list.splice(to, 0, moved);
    // persist the new order onto the join rows
    await Promise.all(list.map((t, i) => db.playlistTracks.update(t.joinId, { order: i })));
    await this.refreshAll();
  }

};
