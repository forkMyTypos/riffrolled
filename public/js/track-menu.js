/* riffrolled — track-menu.js
   Right-click a track in any playlist window (computer only):

     ▶  Play
     ℹ  Track info
     🎲 New mix from this track      DJ AI → Track Rolled Journey, with this
                                     track as the seed
     🔗 Copy link to this track
     ☑  New playlist from the N selected   (when it is part of a selection)
     ✕  Remove from this playlist

   On a phone a long-press picks tracks instead (playlist-select.js), so
   this menu is computer-only. It never covers the YouTube player. */
var trackMenu = {
  init(){
    var m = document.createElement('div');
    m.className = 't-menu track-menu'; m.id = 'trackMenu'; m.hidden = true;
    m.setAttribute('role', 'menu'); m.setAttribute('data-testid', 'track-menu');
    document.body.appendChild(m);
    this.el = m;
    var self = this;
    document.addEventListener('contextmenu', function(e){
      if (document.body.classList.contains('mobile')) return;
      var row = e.target.closest && e.target.closest('.active-pl-tracks .track-item');
      if (!row) return;
      var ctx = self.contextFor(row);
      if (!ctx) return;
      e.preventDefault();
      self.open(e.clientX, e.clientY, ctx, Number(row.dataset.i));
    });
    m.addEventListener('click', function(e){
      var b = e.target.closest('.t-mi'); if (!b) return;
      var c = self.cur; self.close();
      if (c) self.act(b.dataset.a, c);
    });
    document.addEventListener('mousedown', function(e){ if (!m.hidden && !m.contains(e.target)) self.close(); }, true);
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && !m.hidden){ e.preventDefault(); e.stopImmediatePropagation(); self.close(); }
    }, true);
    window.addEventListener('resize', function(){ self.close(); });
    document.addEventListener('scroll', function(){ self.close(); }, true);
  },

  /** which window a row is in, and what it holds */
  contextFor(row){
    if (!window.plBoss) return null;
    var p = plBoss.panels().find(function(x){ return x.currentEl && x.currentEl.contains(row); });
    if (!p) return null;
    return { view: p.view, sel: p.selr, plId: p.activeId, play: function(i){ p.playIndex(i); } };
  },

  open(x, y, ctx, i){
    var t = ctx.view[i]; if (!t) return;
    this.cur = { ctx: ctx, i: i, t: t };
    var picked = ctx.sel && ctx.sel.ids.size > 1 && ctx.sel.ids.has(t.joinId) ? ctx.sel.ids.size : 0;
    var head = (t.artist ? t.artist + ' — ' : '') + (t.name || t.ytId);
    this.el.innerHTML =
      "<div class='tm-head'>" + escapeHtml(head) + "</div>" +
      "<button class='t-mi' data-a='play' role='menuitem' data-testid='tm-play'><span class='t-mi-ico'>▶</span><span class='t-mi-txt'>Play</span></button>" +
      "<button class='t-mi' data-a='info' role='menuitem' data-testid='tm-info'><span class='t-mi-ico'>ℹ</span><span class='t-mi-txt'>Track info</span></button>" +
      "<button class='t-mi' data-a='mix' role='menuitem' data-testid='tm-mix'><span class='t-mi-ico'>🎲</span><span class='t-mi-txt'>New mix from this track <small>DJ AI · Track Rolled</small></span></button>" +
      "<button class='t-mi' data-a='link' role='menuitem' data-testid='tm-link'><span class='t-mi-ico'>🔗</span><span class='t-mi-txt'>Copy link to this track</span></button>" +
      (picked ? "<button class='t-mi' data-a='selpl' role='menuitem' data-testid='tm-selpl'><span class='t-mi-ico'>☑</span><span class='t-mi-txt'>New playlist from the " + picked + " selected</span></button>" : '') +
      "<div class='t-mi-sep'></div>" +
      "<button class='t-mi tm-del' data-a='remove' role='menuitem' data-testid='tm-remove'><span class='t-mi-ico'>✕</span><span class='t-mi-txt'>Remove from this playlist</span></button>";
    var m = this.el;
    m.hidden = false;
    var w = m.offsetWidth, h = m.offsetHeight, W = innerWidth, H = innerHeight, E = 6;
    var px = Math.min(x, W - w - E), py = Math.min(y, H - h - E);
    px = Math.max(E, px); py = Math.max(E, py);
    var v = window.ytGuard && ytGuard.rect();
    if (v && px < v.right && px + w > v.left && py < v.bottom && py + h > v.top){
      // to the other side of the pointer, then above or below the player
      if (x - w - E >= E && !(x - w < v.right && x > v.left)) px = x - w - E;
      else if (v.bottom + E + h <= H) py = v.bottom + E;
      else py = Math.max(E, v.top - h - E);
    }
    m.style.left = Math.round(px) + 'px'; m.style.top = Math.round(py) + 'px';
    var first = m.querySelector('.t-mi'); if (first) first.focus();
  },

  close(){
    // focus must not stay on a hidden button: the keys (Esc, Shift + ↓) belong to the window again
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
    this.el.hidden = true; this.cur = null;
  },

  async act(a, c){
    var t = c.t, ctx = c.ctx;
    if (a === 'play') return ctx.play(c.i);
    if (a === 'info'){ if (window.trackInfo) trackInfo.show(t.ytId); return; }
    if (a === 'link'){
      if (window.shareBoss){
        var link = shareBoss.linkForTrack(t.ytId);
        if (window.riffUsage) riffUsage.count('share_track');
        if (window.linksLog) linksLog.add({ kind: 'sent', type: 'track', ytId: t.ytId, title: t.name, url: link });
        try { await navigator.clipboard.writeText(link); appToast('Link copied — ' + link.replace(/^https?:\/\//, ''), 'ok'); }
        catch(e){ appNotify('Copy this link: ' + link, ''); }
      }
      return;
    }
    if (a === 'selpl'){ if (ctx.sel) ctx.sel.make(); return; }
    if (a === 'remove'){
      await db.playlistTracks.delete(Number(t.joinId));
      await plBoss.refreshAll();
      plBoss.renderPlaylists();
      if (window.searchBoss) searchBoss.render();
      appToast('Removed “' + (t.name || 'that track') + '”', 'ok');
      return;
    }
    if (a === 'mix') return this.mixFrom(t);
  },

  /** DJ AI → Track Rolled Journey, starting fresh from this one track */
  async mixFrom(t){
    if (!window.djAi || !window.djMenuBoss) return;
    await djAi.ready();
    djAi.state.mode = 'seeded';
    djAi.state.seeds = [];
    try { await djAi.addSeed({ ytId: t.ytId, artist: t.artist || '', title: t.name || '' }); }
    catch(e){ appNotify(e.message, 'warn'); return; }
    await djAi.save();
    if (window.dock) dock.openPanel(djMenuBoss.el);
    djMenuBoss.open = {};
    djMenuBoss.renderModes(); djMenuBoss.renderSubModes(); djMenuBoss.renderSections(); djMenuBoss.sync();
    djMenuBoss.status('A journey from “' + (t.name || t.ytId) + '” — add more seeds if you like, then copy', 'ok');
  }
};
window.addEventListener('load', function(){ trackMenu.init(); });
