/* riffrolled — player.js
   The deck: YouTube IFrame player, transport, wake lock,
   hover thumbnails, promoted-track counters, first-run hint. */

/* ── PLAYER / TRANSPORT CONTROLLER ── */
var player = {

  isPlaying: false,
  currentYtId: null,
  spinEnabled: true,

  yt: null,          // YT.Player instance
  ready: false,      // API + player ready
  pending: null,     // a track requested before the player was ready

  el: {
    platter: document.getElementById('platter'),
    arm:     document.getElementById('arm'),
    screenPh: document.getElementById('screenPh'),
    title:   document.querySelector('#npTitle .np-text'),
    panelTitle: document.querySelector('.ct-title'),
    play:    document.getElementById('btnPlay'),
    prev:    document.getElementById('btnPrev'),
    next:    document.getElementById('btnNext'),
    artist:       document.querySelector('.np-artist'),
    tags:         document.querySelector('.np-tags'),
    // reactions appear in two places now (deck + Current Track panel)
    likeCount:    document.querySelectorAll('.like-count'),
    dislikeCount: document.querySelectorAll('.dislike-count')
  },

  // called once the IFrame API has loaded
  initApi: function () {
    var self = this;
    this.yt = new YT.Player('ytFrame', {
      width: 200, height: 200,
      playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onReady: function () {
          self.ready = true;
          if (self.pending) { var p = self.pending; self.pending = null; self.load(p.id, p.title); }
        },
        onStateChange: function (e) { self.onState(e); },
        onError: function (e) { self.onError(e); }
      }
    });
  },

  // unplayable video: tell the user and skip ahead (but stop if the whole queue keeps failing)
  onError: function (e) {
    var code = e && e.data, msg;
    if (code === 100)               msg = 'That video was removed or is private — skipping.';
    else if (code === 101 || code === 150) msg = 'The owner doesn’t allow this one to play in embeds — skipping.';
    else if (code === 2)            msg = 'That video link looks invalid — skipping.';
    else                            msg = 'This video couldn’t be played — skipping.';
    if (window.appNotify) appNotify(msg, 'warn');

    var qlen = (window.plBoss && plBoss.queue) ? plBoss.queue.length : 0;
    this._errStreak = (this._errStreak || 0) + 1;
    var cap = Math.min(qlen || 1, 10);
    if (qlen > 1 && this._errStreak < cap) {
      if (window.plBoss && plBoss.next) plBoss.next();
    } else if (this._errStreak >= cap) {
      if (window.appNotify) appNotify('Several videos in a row couldn’t be played — stopping.', 'warn');
      this._errStreak = 0;
    }
  },

  onState: function (e) {
    if (typeof YT === 'undefined') return;
    if (e.data === YT.PlayerState.ENDED)  { if (window.plBoss && plBoss.next) plBoss.next(); }
    else if (e.data === YT.PlayerState.PLAYING) { this._errStreak = 0; this.setPlaying(true); }
    else if (e.data === YT.PlayerState.PAUSED)  { this.setPlaying(false); }
  },

  load: function (ytId, title) {
    this.ensureVisible();
    this.currentYtId = ytId;
    if (this.el.screenPh) this.el.screenPh.style.display = 'none';
    if (window.deckHint) deckHint.hide();
    var scr = document.querySelector('#deck .screen');
    if (scr) scr.classList.add('has-video');
    this.el.title.textContent = title || ytId;
    if (this.el.panelTitle) this.el.panelTitle.value = title || ytId;
    // pop the Current Track panel on a track change (toggle in that panel; on by default)
    if (window._ctAutoOpen && window.dock && !dock.mobile) {
      var ct = document.getElementById('ctPanel');
      if (ct) dock.openPanel(ct);
    }
    if (this.ready && this.yt && this.yt.loadVideoById) {
      this.yt.loadVideoById(ytId);
    } else {
      this.pending = { id: ytId, title: title };  // play as soon as the player is ready
    }
    this.setPlaying(true);
    if (window.dbBoss) {
      dbBoss.logPlay(ytId);
      // quiet local link tracking: this track followed the previous one
      if (this._lastYtId && this._lastYtId !== ytId) dbBoss.recordPair(this._lastYtId, ytId);
      this._lastYtId = ytId;
      if (window.promoTrack) promoTrack.event(ytId, 'play');
      this.refreshMeta(ytId, title || ytId);
    }
  },

  // ensure a track row exists, then populate artist/tags inputs + reaction counts
  refreshMeta: async function (ytId, title) {
    if (!window.dbBoss) return;
    try {
      await dbBoss.createTrack(ytId, title);
      const t  = await dbBoss.getTrack(ytId);
      const rc = await dbBoss.getReactions(ytId);
      if (this.currentYtId !== ytId) return;  // a newer track loaded while we awaited
      if (this.el.artist)       this.el.artist.value = (t && t.artist) || '';
      if (this.el.tags)         this.el.tags.value   = (t && t.tags)   || '';
      this.el.likeCount.forEach(function(n){ n.textContent = rc.like; });
      this.el.dislikeCount.forEach(function(n){ n.textContent = rc.dislike; });
    } catch (e) { /* meta is best-effort */ }
  },

  toggle: function () {
    if (!this.currentYtId) return;
    if (this.isPlaying) this.pause(); else this.resume();
  },

  pause:  function () { if (this.yt && this.yt.pauseVideo) this.yt.pauseVideo(); this.setPlaying(false); },
  resume: function () { this.ensureVisible(); if (this.yt && this.yt.playVideo)  this.yt.playVideo();  this.setPlaying(true);  },

  // on phones, pressing play in Search, a playlist or the promotion poster
  // switches to the Player tab first — the video is never playing out of sight
  ensureVisible: function () {
    if (window.dock && dock.mobile && dock._mActive !== 'player') dock.showMobile('player');
  },

  setPlaying: function (on) {
    this.isPlaying = on;
    this.el.platter.classList.toggle('playing', on && this.spinEnabled);
    this.el.arm.classList.toggle('playing', on);
    this.el.play.textContent = on ? '⏸' : '▶';
    if (window.plBoss && plBoss.updateStatus) plBoss.updateStatus();
    if (window.wakeBoss) wakeBoss.update();
  }
};

/* ── screen wake lock — phones suspend YouTube playback when the screen
   sleeps, so while a track is playing (and the toggle is on) we ask the
   browser to keep the screen awake. Auto-released on pause; re-acquired
   when the tab becomes visible again (locks always drop when hidden). ── */
var wakeBoss = {
  enabled: false,
  _lock: null,

  init(){
    var wrap = document.getElementById('wakeToggleWrap');
    var box = document.getElementById('wakeToggle');
    if (!('wakeLock' in navigator)){ if (wrap) wrap.style.display = 'none'; return; }
    var self = this;
    dbBoss.getSetting('wakeLock').then(function(v){
      self.enabled = v === '1';
      box.checked = self.enabled;
      self.update();
    });
    box.addEventListener('change', function(){
      self.enabled = box.checked;
      dbBoss.setSetting('wakeLock', self.enabled ? '1' : '0');
      self.update();
    });
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState === 'visible') self.update();
    });
  },

  async update(){
    var want = this.enabled && window.player && player.isPlaying;
    if (want && !this._lock){
      try {
        this._lock = await navigator.wakeLock.request('screen');
        var self = this;
        this._lock.addEventListener('release', function(){ self._lock = null; });
      } catch(e){ /* denied (e.g. low battery mode) — playback still works while screen is on */ }
    } else if (!want && this._lock){
      try { this._lock.release(); } catch(e){}
      this._lock = null;
    }
  }
};
wakeBoss.init();

/* ── promoted-track counters. Keeps the list of currently promoted video
   ids so a play or a like on one can nudge an anonymous counter on the
   promotion row. No wallet, no device id, no history is sent — just
   "this promotion got another play", once per browser session. ── */
var promoTrack = {
  ids: new Set(),
  _sent: new Set(),
  async refresh(){
    try {
      var r = await fetch('/api/promotions');
      if (!r.ok) return;
      var list = await r.json();
      this.ids = new Set(list.map(function(p){
        var m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(p.url || '');
        return m ? m[1] : null;
      }).filter(Boolean));
    } catch(e){ /* offline: counters simply don't fire */ }
  },
  event(ytId, kind){
    if (!ytId || !this.ids.has(ytId)) return;
    var key = kind + ':' + ytId;
    if (this._sent.has(key)) return;         // once per session per track
    this._sent.add(key);
    try {
      fetch('/api/promo/event', { method:'POST', headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=' + ytId, kind: kind }) });
    } catch(e){}
  }
};
promoTrack.refresh();

/* ── hover preview. YouTube publishes thumbnails on a plain CDN path —
   no API key, no quota — so dwelling on any row with a data-yt shows a
   small still. Pointer devices only; touch has no hover to speak of. ── */
var thumbPeek = {
  DELAY: 550,

  init(){
    if (!window.matchMedia || !matchMedia('(hover: hover)').matches) return;
    var pop = document.createElement('div');
    pop.id = 'thumbPop';
    var img = document.createElement('img');
    img.alt = '';
    pop.appendChild(img);
    document.body.appendChild(pop);
    this.pop = pop; this.img = img;

    var self = this;
    document.addEventListener('mouseover', function(e){
      var row = e.target.closest && e.target.closest('[data-yt]');
      if (!row || row === self._row) return;
      self.cancel();
      var id = row.dataset.yt || '';
      if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return;
      self._row = row;
      self._t = setTimeout(function(){ self.show(id, row); }, self.DELAY);
    });
    // ignore moves between a row's own children — only a real exit cancels
    document.addEventListener('mouseout', function(e){
      if (!self._row) return;
      var to = e.relatedTarget;
      if (to && self._row.contains(to)) return;
      self.cancel();
    });
    window.addEventListener('scroll', function(){ self.cancel(); }, true);
    document.addEventListener('click', function(){ self.cancel(); });
  },

  show(id, row){
    var self = this;
    this.img.onerror = function(){ self.cancel(); };   // no thumbnail: show nothing
    this.img.src = 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg';
    var r = row.getBoundingClientRect(), w = 200, h = 112, gap = 10;
    var left = r.left - w - gap;
    if (left < 8) left = Math.min(r.right + gap, window.innerWidth - w - 8);
    var top = Math.min(Math.max(8, r.top - 18), window.innerHeight - h - 8);
    this.pop.style.left = left + 'px';
    this.pop.style.top = top + 'px';
    if (window.ytGuard && ytGuard.overlaps(this.pop)){ this.cancel(); return; }   // never over the player
    this.pop.classList.add('show');
  },

  cancel(){
    clearTimeout(this._t);
    this._row = null;
    if (this.pop) this.pop.classList.remove('show');
  }
};
thumbPeek.init();

/* First run: an empty deck with an empty library is the one moment a newcomer
   has nothing to go on. Point at Import, then get out of the way for good. */
var deckHint = {
  async init(){
    var el = document.getElementById('deckHint');
    if (!el) return;
    try {
      if ((await db.tracks.count()) > 0) return;    // returning user: stay quiet
    } catch(e){ return; }
    el.hidden = false;
    el.querySelector('.dh-go').onclick = function(){
      if (window.dock && window.importBoss) dock.openPanel(importBoss.el);
    };
    this.el = el;
  },
  hide(){ if (this.el) this.el.hidden = true; }
};
window.addEventListener('load', function(){ deckHint.init(); });

/* ── ytGuard ─────────────────────────────────────────────────────────────
   YouTube requires the embedded player to be at least 200x200 and never
   covered by anything else. The deck is laid out around the video, but
   floating things (the promotion poster, hover previews, the banner) can
   appear anywhere — so they ask ytGuard before showing, and an audit runs
   every couple of seconds as a safety net. */
var ytGuard = {
  MIN: 200,

  // the player's box, or null when it isn't on screen (e.g. a phone tab is open)
  rect(){
    var s = document.querySelector('#deck .screen');
    if (!s || !s.offsetParent) return null;
    return s.getBoundingClientRect();
  },

  // would this element, where it is right now, touch the player?
  overlaps(el){
    var v = this.rect();
    if (!v || !el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 &&
           r.left < v.right && r.right > v.left && r.top < v.bottom && r.bottom > v.top;
  },

  /* Safety net. Samples a grid over the player: anything on top that isn't
     part of the player is either stepped aside (our own floating UI) or
     reported. elementFromPoint can't see things with pointer-events:none,
     which is why the floating UI also checks overlaps() itself. */
  audit(){
    var v = this.rect();
    if (!v) return [];
    if (v.width < this.MIN || v.height < this.MIN)
      console.warn('ytGuard: the YouTube player is ' + Math.round(v.width) + 'x' + Math.round(v.height) + ' — YouTube requires at least 200x200');
    var bad = [];
    for (var i = 0; i < 5; i++) for (var j = 0; j < 5; j++){
      var e = document.elementFromPoint(v.left + v.width * (i + 0.5) / 5, v.top + v.height * (j + 0.5) / 5);
      if (e && !e.closest('#deck .screen') && bad.indexOf(e) === -1) bad.push(e);
    }
    ['promoPop', 'thumbPop', 'appBanner'].forEach(function(id){
      var el = document.getElementById(id);
      if (el && !el.hidden && ytGuard.overlaps(el) && bad.indexOf(el) === -1) bad.push(el);
    });
    bad.forEach(function(e){
      var fl = e.closest ? e.closest('#promoPop, #thumbPop, #appBanner') : null;
      if (fl){ fl.classList.remove('show'); fl.hidden = true; }
      else console.warn('ytGuard: something is covering the YouTube player', e);
    });
    return bad;
  }
};
setInterval(function(){ ytGuard.audit(); }, 2000);

function ytPlay(id, title) { player.load(id, title); }

// the IFrame API calls this global when it finishes loading
function onYouTubeIframeAPIReady() { player.initApi(); }

// load the IFrame API (reliable onStateChange / auto-advance, unlike raw postMessage)
(function(){
  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
})();

// spin on/off switch
(function(){
  var t = document.getElementById('spinToggle');
  if (!t) return;
  t.addEventListener('change', function(){
    player.spinEnabled = t.checked;
    player.el.platter.classList.toggle('playing', player.isPlaying && player.spinEnabled);
  });
})();

// now-playing meta: save artist/tags edits; like/dislike tally (can react repeatedly)
(function(){
  var artist  = document.querySelector('.np-artist');
  var tags    = document.querySelector('.np-tags');
  var likes    = document.querySelectorAll('.react-like');
  var dislikes = document.querySelectorAll('.react-dislike');

  if (artist) artist.addEventListener('change', function(){
    if (player.currentYtId && window.dbBoss) dbBoss.updateTrackMeta(player.currentYtId, { artist: artist.value.trim() });
  });
  if (tags) tags.addEventListener('change', function(){
    if (player.currentYtId && window.dbBoss) dbBoss.updateTrackMeta(player.currentYtId, { tags: tags.value.trim() });
  });

  function react(kind){
    return async function(){
      if (!player.currentYtId || !window.dbBoss) return;
      await dbBoss.addReaction(player.currentYtId, kind);
      if (kind === 'like' && window.promoTrack) promoTrack.event(player.currentYtId, 'like');
      player.refreshMeta(player.currentYtId, player.el.title ? player.el.title.textContent : player.currentYtId);
    };
  }
  likes.forEach(function(b){ b.onclick = react('like'); });
  dislikes.forEach(function(b){ b.onclick = react('dislike'); });

  // edit the current track's title from the Current Track panel
  var titleEdit = document.querySelector('.ct-title');
  if (titleEdit) titleEdit.addEventListener('change', async function(){
    if (!player.currentYtId || !window.dbBoss) return;
    var name = titleEdit.value.trim();
    if (!name) return;
    await dbBoss.updateTrackMeta(player.currentYtId, { name: name });
    if (player.el.title) player.el.title.textContent = name;          // deck title
    if (window.plBoss) { await plBoss.renderTracks(); plBoss.renderPlaylists(); }
    if (window.searchBoss) searchBoss.render();
  });

  // "pop up on track change" toggle (persisted; on by default)
  window._ctAutoOpen = true;
  var autopop = document.querySelector('.ct-autopop-cb');
  if (autopop && window.dbBoss) {
    dbBoss.getSetting('ctAutoOpen').then(function(v){
      var on = (v === null || v === undefined) ? true : !!v;
      autopop.checked = on;
      window._ctAutoOpen = on;
    });
    autopop.addEventListener('change', function(){
      window._ctAutoOpen = autopop.checked;
      dbBoss.setSetting('ctAutoOpen', autopop.checked);
    });
  }
})();
