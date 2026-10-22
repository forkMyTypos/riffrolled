/* riffrolled — promo-popup.js
   The point of the whole token economy: this is where promoted tracks
   actually reach other people. A small card slides in now and then,
   offering one promoted track. Selection is weighted by tokens spent,
   so paying more genuinely means being seen more.

   Deliberately restrained — an ad surface that irritates people gets
   ignored, and then promotions are worthless to the promoters too:
     · nothing for the first 40 seconds of a session
     · at most one on screen, never over the record
     · up for a full minute (or until closed), held while it is hovered
     · a gap between appearances, and a session cap
     · dismissing one holds them off for longer
     · tracks you've already been shown aren't repeated in a session */
var promoPopup = {
  FIRST_DELAY: 40000,     // let someone actually arrive before selling to them
  GAP: 300000,            // 5 minutes between cards
  DISMISS_GAP: 900000,    // 15 minutes if they closed the last one
  SESSION_CAP: 6,
  MIN_UP: 60000,          // a card stays at least a minute, unless the person closes it
  LEAVE_GRACE: 8000,      // after the pointer leaves it, it lingers at least this much longer

  shown: 0,
  seen: {},               // promotion ids already offered this session
  _next: 0,

  init(){
    var el = document.createElement('div');
    el.className = 'promo-pop';
    el.id = 'promoPop';
    el.hidden = true;
    document.body.appendChild(el);
    this.el = el;

    var self = this;
    el.addEventListener('click', function(e){
      if (e.target.closest('.pp-close')){ self.dismiss(); return; }
      if (e.target.closest('.pp-play')){
        ytPlay(self.cur.ytId, self.cur.name);
        self.count('play');
        self.hide();
        return;
      }
      if (e.target.closest('.pp-add')){
        self.add();
        return;
      }
      if (e.target.closest('.pp-report')){ self.report(e.target.closest('.pp-report')); return; }
      if (e.target.closest('.pp-why')){
        appNotify('Someone spent riff tokens they mined to show you this track. Mine your own in the ⛏ Mine panel.', 'ok');
      }
    });

    el.addEventListener('pointerenter', function(){ self.hold(); });
    el.addEventListener('pointerleave', function(){ self.release(); });
    el.addEventListener('focusin', function(){ self.hold(); });
    el.addEventListener('focusout', function(){ if (!el.contains(document.activeElement)) self.release(); });

    // Escape closes it too — the poster should never feel like a trap
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && !self.el.hidden) self.dismiss();
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

  async tick(){
    if (this.el.hidden === false) return;                 // one at a time
    if (this.shown >= this.SESSION_CAP) return;
    if (Date.now() < this._next) return;
    if (document.hidden) return;                          // not while tabbed away
    if (window.newHere && newHere.on) return;             // nothing has been played yet: no adverts
    await this.showOne();
  },

  /* The lottery used to run here: fetch the top twenty and pick one
     locally, weighted by spend. It has moved to the server, because once an
     impression costs a credit, a client that chooses which campaign to show
     is a client that can drain a rival's campaign on request.

     The server now picks AND debits in one step, so a credit spent means
     riffrolled showed the card. All this does is draw what it is handed.

     `exclude` asks not to be shown the same campaign twice in a row. It is
     a preference, not a command — the server is free to ignore it, which is
     the point: nothing the browser says can decide where money goes. */
  async showOne(){
    try {
      var ex = Object.keys(this.seen).slice(-6).join(',');
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

      this.cur = { id: p.id, ytId: m[1], name: p.label || p.name || m[1], url: p.url };
      this.seen[p.id] = 1;
      this.shown++;

      /* A record, with the video's picture as its centre label. The title
         and the three buttons appear when the pointer is over it (always,
         on touch). Only the disc turns: the buttons are siblings of it, not
         children, so they never rotate away from the cursor.

         The Promoted chip is not styling. It is the disclosure, so it is
         always shown, sits on the record's lower edge, and is outside both
         the spinning disc and the part that dims on hover. */
      this.el.innerHTML = this.markup(m[1], this.cur.name, p.style);
      this.dress(this.el, p.style, p.color);
      this.el.style.left = ''; this.el.style.right = '';
      this.el.hidden = false;
      /* Never over the YouTube player, and never over the record player itself
         (its controls are on the plinth): try the other corner, else skip this one. */
      var el = this.el;
      var blocked = function(){
        if (window.ytGuard && ytGuard.overlaps(el)) return true;
        var pl = document.querySelector('#deck .plinth');
        if (pl && !document.body.classList.contains('mobile')){
          var a = el.getBoundingClientRect(), b = pl.getBoundingClientRect();
          return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        }
        return false;
      };
      if (blocked()){
        el.style.left = '22px'; el.style.right = 'auto';
        if (blocked()){
          el.hidden = true; el.style.left = ''; el.style.right = '';
          this.shown--; delete this.seen[p.id];
          this._next = Date.now() + 60000;
          /* The credit is already spent and is NOT refunded. riffrolled sold
             the attempt to show a card; that it then had to step aside for
             the YouTube player is riffrolled's problem, not the promoter's —
             but silently keeping the money would be. This is rare enough to
             be worth logging rather than engineering around. */
          if (window.console) console.warn('riffrolled: a promoted card was suppressed (it would have covered the player) after its credit was spent');
          return;
        }
      }
      requestAnimationFrame(function(){ promoPopup.el.classList.add('show'); });

      // the impression was counted server-side when the card was served;
      // nothing to report here
      this._next = Date.now() + this.GAP;

      /* It stays up for a full minute unless the person closes it (the ✕,
         Escape, Play or Add). While the pointer or keyboard focus is on it,
         it stays; once they let go it lingers a few seconds more, and never
         goes before the minute is up. */
      this._shownAt = Date.now();
      this.arm(this.MIN_UP);
    } catch(e){ /* the popup is never worth an error */ }
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

  /* Put a style and a color on a card element (the real one or a preview). */
  dress(el, style, color){
    var st = style === 'poster' ? 'poster' : 'record';
    el.classList.remove('pp-style-record', 'pp-style-poster');
    el.classList.add('pp-style-' + st);
    ['--pp-c','--pp-g1','--pp-g2','--pp-rim','--pp-glow','--pp-sh1','--pp-sh2','--pp-hue','--pp-sat']
      .forEach(function(k){ el.style.removeProperty(k); });
    var lk = this.look(color);
    if (lk) for (var k in lk) el.style.setProperty(k, lk[k]);
    el.classList.toggle('pp-tinted', !!lk);
  },

  async add(){
    try {
      var tid = await dbBoss.createTrack(this.cur.ytId, this.cur.name);
      if (window.plBoss && plBoss.activeId){
        await dbBoss.addToPlaylist(plBoss.activeId, tid);
        plBoss.afterDbChange();
        appNotify('Added “' + this.cur.name + '” to your playlist', 'ok');
      } else {
        appNotify('Saved “' + this.cur.name + '” to your library', 'ok');
      }
      this.count('play');            // saving is engagement worth reporting
      this.hide();
    } catch(e){ appNotify('Couldn’t save that track', 'warn'); }
  },

  /* Engagement on the campaign row — no wallet, no id, no history. Sends
     the campaign id now that the server hands one over, so a track with
     more than one owner's campaign credits the right one.

     This can no longer move money however often it is called: the credit
     was spent when the card was served. That is the only reason it is safe
     to leave unauthenticated. */
  async count(kind){
    if (!this.cur) return;
    try {
      var h = window.riffWallet ? await riffWallet.peekHeaders({ 'content-type':'application/json' }) : { 'content-type':'application/json' };
      fetch('/api/promo/event', { method:'POST', headers: h,
        body: JSON.stringify({ id: this.cur.id, url: this.cur.url, kind: kind }) });
    } catch(e){}
  },

  arm(ms){
    var self = this;
    clearTimeout(this._auto);
    this._auto = setTimeout(function(){ self.hide(); }, ms);
  },

  hold(){ clearTimeout(this._auto); },

  release(){
    if (this.el.hidden) return;
    this.arm(Math.max(this.LEAVE_GRACE, (this._shownAt || 0) + this.MIN_UP - Date.now()));
  },

  /* ⚑ report: "this shouldn't be here". Two presses (no browser dialog,
     which would block the page), then the card goes and that campaign is
     not offered again this visit. Enough different people reporting the
     same campaign holds it for riffrolled's owner to look at. */
  async report(btn){
    if (!this.cur) return;
    if (!btn.classList.contains('sure')){
      btn.classList.add('sure');
      btn.textContent = '⚑ press again to report';
      var b = btn; setTimeout(function(){ if (b.isConnected){ b.classList.remove('sure'); b.textContent = '⚑ report'; } }, 4000);
      return;
    }
    var id = this.cur.id;
    this.seen[id] = 1;
    this.dismiss();
    try {
      await fetch('/api/promo/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: id }) });
    } catch(e){}
    if (window.appToast) appToast('Thanks — reported. You won’t see it again.', 'ok');
  },

  hide(){
    clearTimeout(this._auto);
    this.el.classList.remove('show');
    var self = this;
    setTimeout(function(){ self.el.hidden = true; }, 220);
  },

  dismiss(){
    this.hide();
    this._next = Date.now() + this.DISMISS_GAP;   // they said no: back off properly
  }
};

window.addEventListener('load', function(){ promoPopup.init(); });
