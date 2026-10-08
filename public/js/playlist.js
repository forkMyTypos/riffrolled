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

  queue: [],
  currentIndex: -1,

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
    if (!player.currentYtId && this.queue.length) this.playIndex(0);
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
    };
    menu.addEventListener('click', function(e){
      var mi = e.target.closest('.t-mi');
      if (!mi) return;
      if (mi.dataset.a === 'again'){ self.playAgain(); close(); return; }
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

  bindKeys(){
    document.addEventListener('keydown', (e)=>{
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.code === 'Space'){ e.preventDefault(); player.el.play.onclick(); }
      else if (e.code === 'ArrowRight'){ this.next(); }
      else if (e.code === 'ArrowLeft'){ this.prev(); }
    });
  },

  playIndex(i){
    if (i < 0 || i >= this.queue.length) return;
    this.currentIndex = i;
    const t = this.queue[i];
    player.load(t.ytId, t.name);
    this.syncHighlight();
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
      var face = { all:'🔁', one:'🔂', off:'⋯' }[this.repeat] || '⋯';
      var why = { all:'Repeat: whole playlist', one:'Repeat: this one track',
                  off:'Repeat off — stops at the end' }[this.repeat];
      btn.textContent = face;
      btn.title = why + ' · click for replay options';
      btn.classList.toggle('on', this.repeat !== 'all');
    }
  },

  /** Start the current track over from the beginning. */
  playAgain(){
    var t = this.queue[this.currentIndex];
    if (!t){ if (this.queue.length) this.playIndex(0); return; }
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
    this.playIndex((this.currentIndex + 1) % this.queue.length);
  },

  next(){ if (this.queue.length) this.playIndex((this.currentIndex + 1) % this.queue.length); },
  prev(){ if (this.queue.length) this.playIndex((this.currentIndex - 1 + this.queue.length) % this.queue.length); },

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
    const plId = this.activeId;

    if (joinId != null) await db.playlistTracks.delete(joinId);
    await this.renderTracks();

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
            await this.renderTracks();
          }
        },
      });
    }
  },

  syncHighlight(){
    const c = this.currentEl.querySelector('.active-pl-tracks');
    if (!c) return;
    c.querySelectorAll('.track-item').forEach(el=>{
      el.classList.toggle('active', Number(el.dataset.i) === this.currentIndex);
    });
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
    const inThis = this.queue.some(t => t.ytId === player.currentYtId);
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
    this.renderTracks();
    this.renderPlaylists();
    if (window.searchBoss) searchBoss.render();
  },

  /* ── PLAYLIST PANEL (merged: pick/search/create + current playlist) ── */
  currentM(){
    var title = PLAYLIST_SVG.replace(/plg/g, 'plgT') + ' Playlist';
    var main = `
      <div class="active-pl">

        <div class="pl-toolbar">
          <div class="pl-srh-wrap">
            <input type="text" class="pl-srh" placeholder="🔍 Your playlists…">
            <div class="pl-pop scrollable"></div>
          </div>
        </div>

        <div class="active-pl-header">
          <span class="pl-status">■ Stopped</span>
        </div>

        <div class="active-pl-name-row">
          <span class="pl-name-icon">${PLAYLIST_SVG.replace(/plg/g, 'plgN')}</span>
          <input type="text" class="active-pl-name" value="No playlist" title="Rename this playlist">
          <button class="icon-btn pl-add" title="New playlist (uses the search text as its name)">＋</button>
        </div>

        <div class="active-pl-sub">
          <span>Tracks</span><span class="count">· 0</span>
          <button class="icon-btn add-track-btn" title="Add tracks (opens the Tracks panel)">＋</button>
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
    const openPop = () => { pop.classList.add('open'); this.renderPlPopup(); };
    srh.addEventListener('focus', openPop);
    srh.addEventListener('input', () => { pop.classList.add('open'); this.renderPlPopup(); });
    document.addEventListener('click', (e) => {
      if (!e.target.closest || !e.target.closest('.pl-srh-wrap')) pop.classList.remove('open');
    });
    // one delegated handler: pick a playlist, or delete one
    pop.addEventListener('click', async (e) => {
      const del = e.target.closest('.del-btn');
      if (del){ e.stopPropagation(); await this.deletePlaylist(Number(del.dataset.id)); this.renderPlPopup(); return; }
      const item = e.target.closest('.pl-item');
      if (item){
        await this.setActivePlaylist(Number(item.dataset.id));
        pop.classList.remove('open');
        srh.value = '';
      }
    });

    // ── ＋ new playlist (uses the search text as the name if present) ──
    root.querySelector('.pl-add').onclick = async () => {
      const name = srh.value.trim() || 'New Playlist';
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
    if (!shown.length){
      pop.innerHTML = `<div class="empty">${pls.length ? 'No matches' : 'No playlists yet — hit ＋'}</div>`;
      return;
    }
    const counts = {};
    await Promise.all(shown.map(async pl=>{ counts[pl.id] = await dbBoss.countTracks(pl.id); }));
    pop.innerHTML = shown.map(pl => `
      <div class="row-item pl-item ${pl.id === this.activeId ? 'active' : ''}" data-id="${pl.id}">
        <span class="name pl-item-name">${escapeHtml(pl.name)}</span>
        <span class="pl-item-count">${counts[pl.id]}</span>
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

    if (!this.activeId){
      const remaining = await dbBoss.getPlaylists();
      if (remaining.length){
        await this.setActivePlaylist(remaining[0].id);
      } else {
        this.setTitleName('');
        this.currentEl.querySelector('.active-pl-name').value = 'No playlist';
        this.currentEl.querySelector('.active-pl-tracks').innerHTML = `<div class="empty">No playlist selected</div>`;
        this.currentEl.querySelector('.active-pl-sub .count').textContent = '· 0';
        this.queue = []; this.currentIndex = -1; this.updateStatus();
      }
    }
  },


  /* ── STATE ── */
  async setActivePlaylist(id){
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

    if(!this.activeId){
      container.innerHTML = `<div class="empty">No playlist selected</div>`;
      countEl.textContent = '· 0';
      this.queue = []; this.currentIndex = -1; this.updateStatus();
      return;
    }

    const joins = await db.playlistTracks.where('playlistId').equals(this.activeId).sortBy('order');
    countEl.textContent = '· ' + joins.length;

    if(!joins.length){
      container.innerHTML = `<div class="empty">No tracks yet.<br>Hit ＋ above to add from your library.</div>`;
      this.queue = []; this.currentIndex = -1; this.updateStatus();
      return;
    }

    const tracks = await db.tracks.bulkGet(joins.map(j => j.trackId));
    // `.filter(Boolean)` drops joins whose track row has gone; `playable !== 0`
    // drops the ones YouTube has permanently refused. A dead track is removed
    // from the playlist when it fails, so this is the belt to that braces —
    // it also covers tracks marked dead on another device, or restored from
    // a backup that already knew.
    this.queue = tracks
      .map((t, i) => t ? { ytId: t.ytId, name: t.name, artist: t.artist || '', joinId: joins[i].id, playable: t.playable } : null)
      .filter(t => t && t.playable !== 0);

    this.currentIndex = this.queue.findIndex(t => t.ytId === player.currentYtId);

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

    container.innerHTML = this.queue.map((t, i)=>`
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
        this.playIndex(Number(el.dataset.i));
      };
    });

    // remove
    container.querySelectorAll('.del-btn').forEach(btn=>{
      btn.onclick = async (e)=>{
        e.stopPropagation();
        await db.playlistTracks.delete(Number(btn.dataset.join));
        await this.renderTracks();
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
    this.updateStatus();
  },

  async reorder(from, to){
    const moved = this.queue.splice(from, 1)[0];
    this.queue.splice(to, 0, moved);
    // persist the new order onto the join rows
    await Promise.all(this.queue.map((t, i) => db.playlistTracks.update(t.joinId, { order: i })));
    await this.renderTracks();
  }

};
