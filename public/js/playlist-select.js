/* riffrolled — playlist-select.js
   Picking several tracks in a playlist window, to make a new playlist from
   them. One of these is attached to the main Playlist window and one to
   each extra playlist window (playlist-windows.js).

     computer   Shift + ↓ / ↑     a run of tracks (from the playing track if it
                                  is in this list, else the top / bottom)
                Shift + click     stretch the run to that track
                Ctrl / ⌘ + click  add or remove one
                Enter             name it (a suggestion is filled in), Enter
                                  again makes it; Esc clears
     phone      long-press        start picking (that track); then a tap adds
                                  or removes tracks instead of playing them;
                                  the bar's buttons do the rest

   The keys go to the playlist window you last clicked in, while it is open
   and no text box has the keyboard. Nothing plays while picking. The new
   playlist keeps the tracks in list order; you stay where you were, the
   music carries on, and a banner offers to open it.

   The selection is held by joinId (a track's place in this playlist), so
   re-rendering the list keeps it. Everything here is in this browser only. */
function PlSelect(o){
  // o: { root: the window, list: the element holding .track-item rows,
  //      view(): the rows' tracks, name(): this playlist's name,
  //      playlistId(): its id, open(id): show a playlist }
  this.o = o;
  this.ids = new Set();
  this.anchor = null;
  this.cursor = null;
  this.touch = false;          // picking was started by a long-press: taps add/remove
  this._suppress = false;      // the click that ends a long-press is not a tap
  this.buildBar();
  this.bindList();
  var self = this;
  o.root.addEventListener('pointerdown', function(){ PlSelect.last = self; }, true);
  o.root.addEventListener('focusin', function(){ PlSelect.last = self; });
  PlSelect.all.push(this);
}

PlSelect.all = [];
PlSelect.last = null;
PlSelect.LONG_MS = 480;

PlSelect.isMobile = function(){ return document.body.classList.contains('mobile'); };

// the instance the keys belong to: the window last clicked in, if it is still
// open; else any open one (the main window comes first)
PlSelect.current = function(){
  var open = function(s){ return s && s.o.root.isConnected && !s.o.root.classList.contains('is-hidden') && !!s.o.root.offsetParent; };
  if (open(PlSelect.last)) return PlSelect.last;
  return PlSelect.all.find(open) || null;
};

PlSelect.prototype = {
  buildBar: function(){
    var bar = document.createElement('div');
    bar.className = 'pl-selbar';
    bar.setAttribute('data-testid', 'pl-selbar');
    bar.hidden = true;
    bar.innerHTML =
      "<span class='pl-sel-n'></span>" +
      "<button class='pl-sel-make' data-testid='pl-sel-make' title='Enter'>New playlist from these</button>" +
      "<span class='pl-sel-namewrap' hidden>" +
        "<input type='text' class='pl-sel-name' maxlength='80' aria-label='Name for the new playlist' data-testid='pl-sel-name'>" +
        "<button class='pl-sel-ok' data-testid='pl-sel-ok'>Create</button>" +
      "</span>" +
      "<button class='icon-btn pl-sel-x' title='Clear (Esc)' aria-label='Clear the selection'>✕</button>";
    this.o.list.insertAdjacentElement('afterend', bar);
    this.bar = bar;
    var self = this, inp = bar.querySelector('.pl-sel-name');
    bar.querySelector('.pl-sel-make').onclick = function(){ self.make(); };
    bar.querySelector('.pl-sel-ok').onclick = function(){ self.create(inp.value); };
    bar.querySelector('.pl-sel-x').onclick = function(){ self.clear(); };
    inp.addEventListener('keydown', function(e){
      if (e.key === 'Enter'){ e.preventDefault(); self.create(inp.value); }
      else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); self.clear(); }
    });
  },

  /* Delegated on the list, so re-rendering the rows loses nothing. */
  bindList: function(){
    var self = this, list = this.o.list, timer = null, start = null;
    // a Shift + click shouldn't also select the rows' text
    list.addEventListener('mousedown', function(e){
      if (e.shiftKey && e.target.closest('.track-item')) e.preventDefault();
    });
    // long-press (touch / pen) starts picking
    var cancel = function(){ clearTimeout(timer); timer = null; start = null; };
    list.addEventListener('pointerdown', function(e){
      if (e.pointerType === 'mouse') return;
      var row = e.target.closest('.track-item');
      if (!row || e.target.closest('button, .track-handle')) return;
      start = { x: e.clientX, y: e.clientY, i: Number(row.dataset.i) };
      clearTimeout(timer);
      timer = setTimeout(function(){
        if (!start) return;
        var i = start.i; cancel();
        self.touch = true;
        self._suppress = true;
        setTimeout(function(){ self._suppress = false; }, 700);
        if (!self.has(i)) self.toggle(i);
        if (navigator.vibrate) try { navigator.vibrate(12); } catch(err){}
      }, PlSelect.LONG_MS);
    });
    list.addEventListener('pointermove', function(e){
      if (start && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 10) cancel();
    });
    list.addEventListener('pointerup', cancel);
    list.addEventListener('pointercancel', cancel);
    // no copy / share menu from holding a row
    list.addEventListener('contextmenu', function(e){
      if (e.target.closest('.track-item') && (self.touch || start || PlSelect.isMobile())) e.preventDefault();
    });
  },

  has: function(i){ var t = this.o.view()[i]; return !!t && this.ids.has(t.joinId); },

  /** A click on row i. True when it was a picking click (so nothing plays). */
  rowClick: function(e, i){
    if (this._suppress){ this._suppress = false; return true; }
    var desk = !PlSelect.isMobile();
    if (desk && e.shiftKey){
      var from = (this.anchor !== null && this.ids.size) ? this.anchor : Math.max(0, this.playingIndex());
      this.range(from, i);
      return true;
    }
    if (desk && (e.ctrlKey || e.metaKey)){ this.toggle(i); return true; }
    if (this.touch && this.ids.size){ this.toggle(i); return true; }
    if (this.ids.size) this.clear();
    return false;
  },

  playingIndex: function(){
    var v = this.o.view();
    return v.findIndex(function(t){ return t.ytId === player.currentYtId; });
  },

  keysOn: function(e){
    var root = this.o.root;
    if (!root.isConnected || root.classList.contains('is-hidden') || !root.offsetParent) return false;
    if (PlSelect.isMobile()) return false;
    var t = e.target, tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable) return false;
    return t === document.body || t === document.documentElement || root.contains(t);
  },

  step: function(d){
    var v = this.o.view(), n = v.length;
    if (!n) return;
    if (this.anchor === null || !this.ids.size){
      var playing = this.playingIndex();
      var s = playing >= 0 ? playing : (d > 0 ? 0 : n - 1);
      this.anchor = s;
      this.cursor = playing >= 0 ? Math.max(0, Math.min(n - 1, s + d)) : s;
    } else {
      this.cursor = Math.max(0, Math.min(n - 1, this.cursor + d));
    }
    this.range(this.anchor, this.cursor);
    var row = this.o.list.querySelector('.track-item[data-i="' + this.cursor + '"]');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  },

  range: function(a, b){
    var lo = Math.min(a, b), hi = Math.max(a, b);
    this.ids = new Set(this.o.view().slice(lo, hi + 1).map(function(t){ return t.joinId; }));
    this.anchor = a; this.cursor = b;
    this.paint();
  },

  toggle: function(i){
    var t = this.o.view()[i]; if (!t) return;
    if (this.ids.has(t.joinId)) this.ids.delete(t.joinId); else this.ids.add(t.joinId);
    this.anchor = i; this.cursor = i;
    this.paint();
  },

  clear: function(){
    this.ids = new Set(); this.anchor = null; this.cursor = null; this.touch = false;
    this.paint();
  },

  paint: function(){
    var self = this, view = this.o.view(), have = new Set(view.map(function(t){ return t.joinId; }));
    this.ids.forEach(function(id){ if (!have.has(id)) self.ids.delete(id); });
    this.o.list.querySelectorAll('.track-item').forEach(function(el){
      var t = view[Number(el.dataset.i)], on = !!t && self.ids.has(t.joinId);
      el.classList.toggle('sel', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    this.o.list.classList.toggle('picking', this.touch && this.ids.size > 0);
    var bar = this.bar;
    bar.hidden = !this.ids.size;
    if (!this.ids.size){
      this.touch = false;
      bar.querySelector('.pl-sel-namewrap').hidden = true;
      bar.querySelector('.pl-sel-make').hidden = false;
      return;
    }
    bar.querySelector('.pl-sel-n').textContent = this.ids.size + (this.ids.size === 1 ? ' track' : ' tracks');
  },

  // step 2: a name, suggested and selected so typing replaces it
  make: function(){
    var n = this.ids.size; if (!n) return;
    var wrap = this.bar.querySelector('.pl-sel-namewrap'), inp = this.bar.querySelector('.pl-sel-name');
    if (!wrap.hidden){ this.create(inp.value); return; }
    var from = String(this.o.name() || '').trim() || 'playlist';
    inp.value = 'From ' + from + ' · ' + n + (n === 1 ? ' track' : ' tracks');
    this.bar.querySelector('.pl-sel-make').hidden = true;
    wrap.hidden = false;
    inp.focus(); inp.select();
  },

  // step 3: make it, in list order, and stay here
  create: async function(name){
    var self = this, picked = this.o.view().filter(function(t){ return self.ids.has(t.joinId); });
    if (!picked.length) return;
    name = String(name || '').trim().slice(0, 80) || ('New playlist · ' + picked.length + ' tracks');
    try {
      var id = await dbBoss.createPl(name);
      for (var i = 0; i < picked.length; i++) await dbBoss.addToPlaylist(id, picked[i].trackId);
      this.clear();
      if (window.plBoss) await plBoss.renderPlaylists();
      if (window.searchBoss) searchBoss.render();
      var open = this.o.open;
      appNotify('Made “' + name + '” · ' + picked.length + (picked.length === 1 ? ' track' : ' tracks'), 'ok', {
        label: 'Open it', run: function(){ return open(id); }
      });
      document.documentElement.setAttribute('data-rr-last-action', 'playlistFromSelection');
      return id;
    } catch(e){
      appNotify('Couldn’t make that playlist: ' + (e && e.message || e), 'warn');
    }
  }
};

/* The keys, for whichever window they belong to. Capture phase, so Escape
   clears a selection before anything else (a promoted card) takes it. */
document.addEventListener('keydown', function(e){
  var s = PlSelect.current();
  if (!s || !s.keysOn(e)) return;
  if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')){
    e.preventDefault();
    s.step(e.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (!s.ids.size) return;
  if (e.key === 'Escape'){ e.preventDefault(); s.clear(); return; }
  if (e.key === 'Enter' && !(e.target.closest && e.target.closest('button'))){ e.preventDefault(); s.make(); }
}, true);
