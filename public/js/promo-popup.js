/* riffrolled — promo-popup.js
   The point of the whole token economy: this is where promoted tracks
   actually reach other people. Now and then a card arrives offering one
   promoted track. Selection is weighted by tokens spent (on the server),
   so paying more genuinely means being seen more.

   How the cards behave:
     · nothing for the first 40 seconds of a session, nor before the first play
     · a new card every 5 minutes; each one stays until the listener closes it
     · up to 5 on screen (1 on a phone). When it is time for a new one and
       5 are up, it replaces the oldest — in the same spot, at the same size —
       unless the listener has the pointer or keyboard on that one
     · on a computer, a card can be dragged anywhere and resized from its
       corner; the spots (position and size) are remembered between visits
     · never over the YouTube player, nor over the record player's plinth:
       a card dropped there slides to the nearest clear spot
     · closing every card on screen holds the next one off for 15 minutes
     · a campaign is not offered twice in a visit
     · every card shown goes into History → Ads (the last 20, in this
       browser only, via Dexie)

   One credit is spent when a card is served, however long it then stays. */
var promoPopup = {
  FIRST_DELAY: 40000,     // let someone actually arrive before selling to them
  GAP: 300000,            // 5 minutes between new cards
  DISMISS_GAP: 900000,    // 15 minutes once they have closed every card
  SESSION_CAP: 12,        // new cards per visit (an hour of arrivals)
  MAX: 5,                 // on screen at once on a computer
  MAX_PHONE: 1,
  MIN_SCALE: 0.7,         // resize limits, relative to the normal size
  MAX_SCALE: 1.6,
  EDGE: 8,                // keep this far inside the window

  shown: 0,
  seen: {},               // promotion ids already offered this visit
  cards: [],              // what is on screen: { el, cur, slot, at }
  slots: [],              // remembered spots: { cx, cy, s } (centre as a fraction of the window, scale)
  _next: 0,
  _z: 0,

  init(){
    var self = this;
    this.load();
    // Escape closes the card that has focus, else the newest one
    document.addEventListener('keydown', function(e){
      if (e.key !== 'Escape' || !self.cards.length || e.defaultPrevented) return;
      var c = self.cards.find(function(x){ return x.el.contains(document.activeElement); }) || self.cards[self.cards.length - 1];
      self.close(c, true);
    });
    var rt;
    window.addEventListener('resize', function(){
      clearTimeout(rt);
      rt = setTimeout(function(){ self.cards.forEach(function(c){ self.settle(c, false); }); }, 150);
    });

    this._next = Date.now() + this.FIRST_DELAY;
    setInterval(function(){ self.tick(); }, 15000);

    /* Testing: riffrolled.com/?promo=now asks for one card straight away,
       skipping the 40-second wait and the new-visitor hold, so a campaign
       can be seen working without sitting through the pacing. It goes
       through showOne() like every other card, so it still takes a real
       credit from a real campaign and still steps aside for the player. */
    if (/[?&]promo=now(&|$)/.test(location.search)){
      setTimeout(function(){ self.showOne(); }, 2500);
    }
  },

  phone(){ return document.body.classList.contains('mobile'); },
  max(){ return this.phone() ? this.MAX_PHONE : this.MAX; },

  async load(){
    try {
      var v = window.dbBoss && await dbBoss.getSetting('promoSlots');
      var a = v ? JSON.parse(v) : [];
      if (Array.isArray(a)) this.slots = a.slice(0, this.MAX).map(function(x){
        return x && isFinite(x.cx) && isFinite(x.cy) && isFinite(x.s) ? { cx: +x.cx, cy: +x.cy, s: +x.s } : null;
      });
    } catch(e){ this.slots = []; }
  },

  save(){
    try { if (window.dbBoss) dbBoss.setSetting('promoSlots', JSON.stringify(this.slots.slice(0, this.MAX))); } catch(e){}
  },

  async tick(){
    if (this.shown >= this.SESSION_CAP) return;
    if (Date.now() < this._next) return;
    if (document.hidden) return;                          // not while tabbed away
    if (window.newHere && newHere.on) return;             // nothing has been played yet: no adverts
    if (document.querySelector('.pl-selbar:not([hidden])')) return;   // someone is picking tracks: not now
    await this.showOne();
  },

  /* Which card would a new one replace? The oldest the listener isn't
     touching. null = none can go right now (so don't fetch, which spends). */
  victim(){
    var busy = function(c){ return c.el.matches(':hover') || c.el.contains(document.activeElement) || c.el.classList.contains('pp-moving'); };
    var free = this.cards.filter(function(c){ return !busy(c); });
    if (!free.length) return null;
    return free.reduce(function(a, b){ return a.at <= b.at ? a : b; });
  },

  /* The lottery runs on the server: once an impression costs a credit, a
     client that chooses which campaign to show is a client that can drain a
     rival's campaign on request. The server picks AND debits in one step;
     all this does is draw what it is handed.

     `exclude` asks not to be shown the same campaigns again. It is a
     preference, not a command — nothing the browser says decides where
     money goes. */
  async showOne(){
    try {
      // decide where it goes before asking, because asking spends a credit
      var old = null, slot = -1;
      if (this.cards.length >= this.max()){
        old = this.victim();
        if (!old) return;                                   // they're using every card: try later
        slot = old.slot;
      } else {
        var used = this.cards.map(function(c){ return c.slot; });
        for (var i = 0; i < this.max(); i++) if (used.indexOf(i) < 0){ slot = i; break; }
      }

      var ex = Object.keys(this.seen).slice(-12).join(',');
      /* Genre targeting: the genre of the track on the deck, from this
         browser's own library. Only the genre's name goes; the server uses
         it to leave out campaigns aimed at other genres. */
      var genre = '';
      try { var tr = player.currentYtId && await dbBoss.getTrack(player.currentYtId); genre = (tr && tr.genre) || ''; } catch(e){}
      var r = await fetch('/api/promotions/next?mode=popup' + (ex ? '&exclude=' + encodeURIComponent(ex) : '') +
                          (genre ? '&genre=' + encodeURIComponent(genre) : ''),
                          { cache: 'no-store', headers: window.riffWallet ? await riffWallet.peekHeaders() : {} });
      if (!r.ok) return;
      var body = await r.json();
      var p = body && body.promotion;
      if (!p) return;                       // nothing live, or its last credit went elsewhere
      var m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(p.url || '');
      if (!m) return;
      // the victim may have been closed (or grabbed) while we were asking
      if (old && this.cards.indexOf(old) < 0) old = null;
      if (old && (old.el.matches(':hover') || old.el.classList.contains('pp-moving'))){
        var again = this.victim(); old = again; if (again) slot = again.slot;
      }
      if (!old && this.cards.length >= this.max()) old = this.victim();
      if (old){ slot = old.slot; this.remove(old, true); }

      var cur = { id: p.id, ytId: m[1], name: p.label || p.name || m[1], url: p.url,
                  style: p.style === 'poster' ? 'poster' : 'record', color: p.color || '', size: p.size || 'md', hole: p.hole === 0 ? 0 : 1 };
      this.seen[p.id] = 1;
      this.shown++;

      var c = this.build(cur, slot);
      if (!this.settle(c, true)){
        // nowhere clear of the player: step aside (see below)
        this.remove(c, false);
        this.shown--; delete this.seen[p.id];
        this._next = Date.now() + 60000;
        /* The credit is already spent and is NOT refunded. riffrolled sold
           the attempt to show a card; that it then had to step aside for
           the YouTube player is riffrolled's problem, not the promoter's —
           but silently keeping the money would be. Rare enough to log. */
        if (window.console) console.warn('riffrolled: a promoted card was suppressed (it would have covered the player) after its credit was spent');
        return;
      }
      requestAnimationFrame(function(){ c.el.classList.add('show'); });
      if (window.riffUsage) riffUsage.count('promo_shown');
      this._next = Date.now() + this.GAP;
      // History → Ads: the last 20, in this browser only
      try { if (window.dbBoss && dbBoss.addAdSeen) dbBoss.addAdSeen({ promoId: cur.id, ytId: cur.ytId, name: cur.name, url: cur.url, style: cur.style, color: cur.color, size: cur.size, hole: cur.hole }); } catch(e){}
    } catch(e){ /* a card is never worth an error */ }
  },

  /* One card element, wired up. */
  build(cur, slot){
    var el = document.createElement('div');
    el.className = 'promo-pop pp-float';
    el.setAttribute('data-testid', 'promo-card');
    el.setAttribute('role', 'complementary');
    el.setAttribute('aria-label', 'Promoted track');
    el.innerHTML = this.markup(cur.ytId, cur.name, cur.style)
      + (this.phone() ? '' : "<span class='pp-grip' title='Drag to resize' data-testid='pp-grip'></span>");
    this.dress(el, cur.style, cur.color, cur.size, cur.hole);
    document.body.appendChild(el);
    var c = { el: el, cur: cur, slot: slot, at: Date.now() };
    this.cards.push(c);
    var self = this;
    el.addEventListener('click', function(e){
      if (el._dragged){ el._dragged = false; return; }       // the end of a drag is not a click
      if (e.target.closest('.pp-close')){ if (window.riffUsage) riffUsage.count('promo_close'); self.close(c, true); return; }
      if (e.target.closest('.pp-play')){ if (window.riffUsage) riffUsage.count('promo_play'); ytPlay(cur.ytId, cur.name); self.count('play', cur); self.close(c, false); return; }
      if (e.target.closest('.pp-add')){ if (window.riffUsage) riffUsage.count('promo_add'); self.add(c); return; }
      if (e.target.closest('.pp-report')){ self.report(e.target.closest('.pp-report'), c); return; }
      if (e.target.closest('.pp-why')){
        appNotify('Someone spent riff tokens they mined to show you this track. Mine your own in the ⛏ Mine panel.', 'ok');
      }
    });
    if (!this.phone()) this.handles(c);
    return c;
  },

  /* ── size and place ─────────────────────────────────────────────────── */
  base(style){ return style === 'poster' ? { w: 150, h: 209 } : { w: 190, h: 190 }; },

  scaleOf(c){ var sl = this.slots[c.slot]; return sl ? sl.s : 1; },

  // set the card's size from a scale; the buttons follow it
  sizeTo(c, s){
    s = Math.max(this.MIN_SCALE, Math.min(this.MAX_SCALE, s || 1));
    c.s = s;
    if (this.phone()){ c.el.style.width = c.el.style.height = ''; c.el.style.removeProperty('--pp-b'); return s; }
    var b = this.base(c.cur.style), w = Math.round(b.w * s), h = Math.round(b.h * s);
    c.el.style.width = w + 'px'; c.el.style.height = h + 'px';
    c.el.style.setProperty('--pp-b', Math.round(Math.max(26, Math.min(46, w * (c.cur.style === 'poster' ? 0.24 : 0.22)))) + 'px');
    return s;
  },

  moveTo(c, x, y){
    var W = window.innerWidth, H = window.innerHeight, w = c.el.offsetWidth, h = c.el.offsetHeight, E = this.EDGE;
    x = Math.max(E, Math.min(W - w - E, x)); y = Math.max(E + 20, Math.min(H - h - E - 10, y));   // room for the title above and the tag below
    c.el.style.left = Math.round(x) + 'px'; c.el.style.top = Math.round(y) + 'px';
    c.el.style.right = 'auto'; c.el.style.bottom = 'auto';
  },

  // where a slot nobody has moved goes: up the right-hand side, then a column further in
  defaultSpot(c){
    var W = window.innerWidth, H = window.innerHeight, w = c.el.offsetWidth, h = c.el.offsetHeight;
    var per = Math.max(1, Math.floor((H - 60) / (h + 34)));
    var col = Math.floor(c.slot / per), row = c.slot % per;
    return { x: W - 78 - w - col * (w + 28), y: H - 30 - h - row * (h + 34) };
  },

  rectHits(a, b){ return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; },

  // what a card may not sit on: the YouTube player, the record player's plinth, and (for a new card) the others
  blocked(c, x, y, others){
    var w = c.el.offsetWidth, h = c.el.offsetHeight, a = { left: x, top: y - 18, right: x + w, bottom: y + h + 12 };
    var v = window.ytGuard && ytGuard.rect();
    if (v && this.rectHits(a, { left: v.left - 8, top: v.top - 8, right: v.right + 8, bottom: v.bottom + 8 })) return true;
    var pl = document.querySelector('#deck .plinth');
    if (pl && pl.offsetParent){
      var q = pl.getBoundingClientRect();     // a margin, so the hover zoom never tips it over the edge
      if (this.rectHits(a, { left: q.left - 8, top: q.top - 8, right: q.right + 8, bottom: q.bottom + 8 })) return true;
    }
    var rail = document.querySelector('.rightM');                // the dock rail on the right
    if (rail && rail.offsetParent && this.rectHits(a, rail.getBoundingClientRect())) return true;
    if (others){
      // a new card also keeps off any window the listener has open
      var ps = document.querySelectorAll('.panel:not(.is-hidden)');
      for (var k = 0; k < ps.length; k++){
        if (ps[k].offsetParent && this.rectHits(a, ps[k].getBoundingClientRect())) return true;
      }
    }
    if (others) for (var i = 0; i < this.cards.length; i++){
      var o = this.cards[i]; if (o === c) continue;
      if (this.rectHits({ left: x, top: y, right: x + w, bottom: y + h }, o.el.getBoundingClientRect())) return true;
    }
    return false;
  },

  /* The nearest spot to (x, y) that is inside the window and clear. A ring
     search outwards in 24px steps; null if there is none at all. */
  clearSpot(c, x, y, others){
    var W = window.innerWidth, H = window.innerHeight, w = c.el.offsetWidth, h = c.el.offsetHeight, E = this.EDGE;
    var cl = function(px, py){ return { x: Math.max(E, Math.min(W - w - E, px)), y: Math.max(E + 20, Math.min(H - h - E - 10, py)) }; };
    var p0 = cl(x, y);
    if (!this.blocked(c, p0.x, p0.y, others)) return p0;
    var step = 24, maxR = Math.ceil(Math.max(W, H) / step);
    for (var r = 1; r <= maxR; r++){
      var best = null, bd = Infinity;
      for (var i = -r; i <= r; i++) for (var j = -r; j <= r; j++){
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        var q = cl(p0.x + i * step, p0.y + j * step);
        var d = (q.x - p0.x) * (q.x - p0.x) + (q.y - p0.y) * (q.y - p0.y);
        if (d < bd && !this.blocked(c, q.x, q.y, others)){ best = q; bd = d; }
      }
      if (best) return best;
    }
    return null;
  },

  /* Size the card, put it in its slot's spot (or the default one), and make
     sure it is clear. `fresh`: a new card also keeps off the other cards
     when it is in a default spot. Returns false if nowhere is clear. */
  settle(c, fresh){
    this.sizeTo(c, c.s || this.scaleOf(c));
    if (this.phone()) return !(window.ytGuard && ytGuard.overlaps(c.el));
    var sl = this.slots[c.slot], w = c.el.offsetWidth, h = c.el.offsetHeight, x, y;
    if (!fresh && c.el.style.left){ x = c.el.offsetLeft; y = c.el.offsetTop; }
    else if (sl){ x = sl.cx * window.innerWidth - w / 2; y = sl.cy * window.innerHeight - h / 2; }
    else { var d = this.defaultSpot(c); x = d.x; y = d.y; }
    /* A new card in a default spot keeps off the other cards and any open
       window, within reach; failing that, off the player and plinth is enough.
       A remembered spot is used as it is (the listener chose it). */
    var q = null;
    if (fresh && !sl){
      q = this.clearSpot(c, x, y, true);
      if (q && Math.abs(q.x - x) + Math.abs(q.y - y) > 600) q = null;   // too far from where it belongs
    }
    q = q || this.clearSpot(c, x, y, false);
    if (!q) return false;
    this.moveTo(c, q.x, q.y);
    return true;
  },

  // the listener moved or resized it: this slot remembers it
  remember(c){
    var r = c.el.getBoundingClientRect();
    this.slots[c.slot] = { cx: +((r.left + r.width / 2) / window.innerWidth).toFixed(4),
                           cy: +((r.top + r.height / 2) / window.innerHeight).toFixed(4), s: +(c.s || 1).toFixed(3) };
    for (var i = 0; i < this.slots.length; i++) if (this.slots[i] === undefined) this.slots[i] = null;
    this.save();
  },

  /* Drag anywhere on the card except its buttons; resize from the grip. */
  handles(c){
    var self = this, el = c.el, st = null;
    el.addEventListener('pointerdown', function(e){
      if (e.button !== 0) return;
      /* A drag can start anywhere, buttons included (they cover most of the
         record): a press that doesn't move is still a click, and the pointer
         is only captured once it has moved, so the click lands on the button. */
      var grip = e.target.closest('.pp-grip');
      el.style.zIndex = String(2600 + (++self._z));             // the one you grab comes to the front
      st = { grip: !!grip, x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, s: c.s || 1, moved: false, id: e.pointerId };
      if (grip){ e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch(err){} }
    });
    el.addEventListener('pointermove', function(e){
      if (!st || e.pointerId !== st.id) return;
      var dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      if (!st.moved){
        st.moved = true; el.classList.add('pp-moving');
        try { el.setPointerCapture(e.pointerId); } catch(err){}
        var sel = window.getSelection && window.getSelection(); if (sel) sel.removeAllRanges();
      }
      if (st.grip){
        var b = self.base(c.cur.style);
        self.sizeTo(c, (st.w + Math.max(dx, dy * b.w / b.h)) / b.w);
      } else {
        self.moveTo(c, st.l + dx, st.t + dy);
      }
    });
    var end = function(e){
      if (!st || e.pointerId !== st.id) return;
      var was = st; st = null;
      try { el.releasePointerCapture(e.pointerId); } catch(err){}
      el.classList.remove('pp-moving');
      if (!was.moved) return;
      el._dragged = true; setTimeout(function(){ el._dragged = false; }, 0);
      // dropped on the player or the plinth: slide to the nearest clear spot
      var q = self.clearSpot(c, el.offsetLeft, el.offsetTop, false);
      if (q){
        el.classList.add('pp-sliding');
        self.moveTo(c, q.x, q.y);
        setTimeout(function(){ el.classList.remove('pp-sliding'); }, 260);
      }
      self.remember(c);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  },

  /* ytGuard's safety net found this card on the player (the window was
     resized, the deck moved): move it off, or take it down. */
  avoidPlayer(el){
    var c = this.cards.find(function(x){ return x.el === el; });
    if (!c) return;
    if (this.phone() || !this.settle(c, false)) this.remove(c, false);
  },

  remove(c, quick){
    var i = this.cards.indexOf(c);
    if (i >= 0) this.cards.splice(i, 1);
    c.el.classList.remove('show');
    setTimeout(function(){ c.el.remove(); }, quick ? 120 : 220);
  },

  /* The listener closed it (✕ or Escape). Closing the last one on screen is
     a "not now": the next card waits longer. */
  close(c, byListener){
    if (!c) return;
    this.remove(c, false);
    if (byListener && !this.cards.length) this._next = Math.max(this._next, Date.now() + this.DISMISS_GAP);
  },

/* The card's inside, shared by the real pop-up and by the preview in the
     Promote window, so the preview is the advertisement and not a drawing of
     it. Nothing in here is interactive until a click handler is attached to
     whatever holds it. */
  markup(ytId, name, style){
    var art = "<img class='pp-art' src='https://i.ytimg.com/vi/" + ytId + "/mqdefault.jpg'"
            + " alt='' width='320' height='180' draggable='false'>";
    /* The picture is the record's label, or is taped onto the poster. Either
       way the buttons are siblings of what turns or tilts, and the Promoted
       tag is outside everything that dims or is tinted. */
    var face = style === 'poster'
      ? "<div class='pp-sheet'>"
          + "<img class='pp-sheet-bg' src='img/promote-poster.webp' alt='' draggable='false'>"
          + art
        + "</div>"
      : "<div class='pp-vinyl'>" + art + "<span class='pp-hole'></span></div>";
    return "<div class='pp-disc'>" + face
        + "<div class='pp-acts'>"
          + "<button class='pp-play' title='Play now' aria-label='Play now'>\u25B6</button>"
          + "<button class='pp-add' title='Add to your playlist' aria-label='Add to your playlist'>\uFF0B</button>"
          + "<button class='pp-close' title='Close' aria-label='Close'>\u2715</button>"
        + "</div>"
      + "</div>"
      + "<span class='pp-tag'>Promoted</span>"
      + "<div class='pp-foot'>"
        + "<div class='pp-name'>" + escapeHtml(name) + "</div>"
        + "<div class='pp-links'>"
          + "<button class='pp-why' title='Why am I seeing this?'>why am I seeing this?</button>"
          + "<button class='pp-report' title='Tell riffrolled this shouldn’t be here' data-testid='pp-report'>⚑ report</button>"
        + "</div>"
      + "</div>";
  },

  /* The colors an advertiser can choose from with one click. The empty one
     is the original look. A campaign stores only the hex (or nothing), so
     adding a palette here changes no data. */
  PALETTES: [
    { id:'classic', name:'Classic', color:'' },
    { id:'neon',    name:'Neon',    color:'#19e6ff' },
    { id:'pink',    name:'Hot pink',color:'#ff3fb4' },
    { id:'sunset',  name:'Sunset',  color:'#ff8a3d' },
    { id:'gold',    name:'Gold',    color:'#ffcc4d' },
    { id:'toxic',   name:'Toxic',   color:'#a6ff3d' },
    { id:'ice',     name:'Ice',     color:'#7cc4ff' },
    { id:'violet',  name:'Violet',  color:'#9b7bff' },
    { id:'mono',    name:'Mono',    color:'#b8b8c4' }
  ],

  /* A chosen color -> the handful of CSS variables the card is tinted with.
     Any color is allowed, so this clamps: the lightness is held between
     .42 and .72 so a near-black pick still glows and a near-white one is
     still a color. It only ever produces decoration, and none of it
     touches the Promoted tag. The poster is recolored by turning its hue
     (its artwork is yellow and red) and scaling its saturation, so a grey
     pick gives a grey poster. */
  look(color){
    if (!/^#[0-9a-f]{6}$/i.test(color || '')) return null;
    var r = parseInt(color.substr(1,2),16)/255, g = parseInt(color.substr(3,2),16)/255, b = parseInt(color.substr(5,2),16)/255;
    var mx = Math.max(r,g,b), mn = Math.min(r,g,b), l = (mx+mn)/2, d = mx-mn, h = 0, sat = 0;
    if (d){
      sat = d / (1 - Math.abs(2*l - 1));
      if (mx === r) h = ((g-b)/d) % 6; else if (mx === g) h = (b-r)/d + 2; else h = (r-g)/d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    var L = Math.min(.72, Math.max(.42, l));
    var c = (1 - Math.abs(2*L - 1)) * sat, x = c * (1 - Math.abs((h/60) % 2 - 1)), m = L - c/2, q;
    if (h < 60) q = [c,x,0]; else if (h < 120) q = [x,c,0]; else if (h < 180) q = [0,c,x];
    else if (h < 240) q = [0,x,c]; else if (h < 300) q = [x,0,c]; else q = [c,0,x];
    var rgb = q.map(function(v){ return Math.round((v + m) * 255); });
    var mix = function(base, t){
      return 'rgb(' + base.map(function(v, i){ return Math.round(v + (rgb[i] - v) * t); }).join(',') + ')';
    };
    var a = function(t){ return 'rgba(' + rgb.join(',') + ',' + t + ')'; };
    return {
      '--pp-c':    'rgb(' + rgb.join(',') + ')',
      '--pp-g1':   mix([11,11,17], .20),
      '--pp-g2':   mix([21,21,29], .32),
      '--pp-rim':  a(.7),
      '--pp-glow': a(.5),
      '--pp-sh1':  a(.34),
      '--pp-sh2':  a(.24),
      '--pp-hue':  Math.round(h - 42) + 'deg',
      '--pp-sat':  String(Math.min(1.25, Math.max(0, sat * 1.3)).toFixed(2))
    };
  },

  /* How much of the record is picture (the advertiser's choice). The
     poster ignores it. */
  SIZES: [
    { id:'sm', name:'More vinyl' },
    { id:'md', name:'Balanced' },
    { id:'lg', name:'More picture' }
  ],

  /* Put a style, a color, a label size and the hole (or not) on a card
     element (the real one or a preview). hole: anything but 0 / false is
     the original record, with its spindle hole. */
  dress(el, style, color, size, hole){
    var st = style === 'poster' ? 'poster' : 'record';
    var sz = (size === 'sm' || size === 'lg') ? size : 'md';
    el.classList.remove('pp-style-record', 'pp-style-poster', 'pp-label-sm', 'pp-label-md', 'pp-label-lg', 'pp-nohole');
    el.classList.add('pp-style-' + st, 'pp-label-' + sz);
    if (hole === 0 || hole === false || hole === '0') el.classList.add('pp-nohole');
    ['--pp-c','--pp-g1','--pp-g2','--pp-rim','--pp-glow','--pp-sh1','--pp-sh2','--pp-hue','--pp-sat']
      .forEach(function(k){ el.style.removeProperty(k); });
    var lk = this.look(color);
    if (lk) for (var k in lk) el.style.setProperty(k, lk[k]);
    el.classList.toggle('pp-tinted', !!lk);
  },

  async add(c){
    var cur = c.cur;
    try {
      var tid = await dbBoss.createTrack(cur.ytId, cur.name);
      if (window.plBoss && plBoss.targetId){
        await dbBoss.addToPlaylist(plBoss.targetId, tid);
        plBoss.afterDbChange();
        appNotify('Added “' + cur.name + '” to your playlist', 'ok');
      } else {
        appNotify('Saved “' + cur.name + '” to your library', 'ok');
      }
      this.count('play', cur);       // saving is engagement worth reporting
      this.close(c, false);
    } catch(e){ appNotify('Couldn’t save that track', 'warn'); }
  },

  /* Engagement on the campaign row — no wallet, no id, no history. Sends
     the campaign id, so a track with more than one owner's campaign credits
     the right one. It cannot move money however often it is called: the
     credit was spent when the card was served. That is the only reason it
     is safe to leave unauthenticated. History → Ads uses it too. */
  async count(kind, cur){
    if (!cur) return;
    try {
      var h = window.riffWallet ? await riffWallet.peekHeaders({ 'content-type':'application/json' }) : { 'content-type':'application/json' };
      fetch('/api/promo/event', { method:'POST', headers: h,
        body: JSON.stringify({ id: cur.id, url: cur.url, kind: kind }) });
    } catch(e){}
  },

  /* ⚑ report: "this shouldn't be here". Two presses (no browser dialog,
     which would block the page), then the card goes and that campaign is
     not offered again this visit. Enough different people reporting the
     same campaign holds it for riffrolled's owner to look at. */
  async report(btn, c){
    if (!btn.classList.contains('sure')){
      btn.classList.add('sure');
      btn.textContent = '⚑ press again to report';
      var b = btn; setTimeout(function(){ if (b.isConnected){ b.classList.remove('sure'); b.textContent = '⚑ report'; } }, 4000);
      return;
    }
    var id = c.cur.id;
    this.seen[id] = 1;
    if (window.riffUsage) riffUsage.count('promo_report');
    this.close(c, true);
    try {
      await fetch('/api/promo/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: id }) });
    } catch(e){}
    if (window.appToast) appToast('Thanks — reported. You won’t see it again.', 'ok');
  }
};

window.addEventListener('load', function(){ promoPopup.init(); });
