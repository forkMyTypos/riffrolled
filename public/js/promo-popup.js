/* riffrolled — promo-popup.js
   The point of the whole token economy: this is where promoted tracks
   actually reach other people. A small card slides in now and then,
   offering one promoted track. Selection is weighted by tokens spent,
   so paying more genuinely means being seen more.

   Deliberately restrained — an ad surface that irritates people gets
   ignored, and then promotions are worthless to the promoters too:
     · nothing for the first 40 seconds of a session
     · at most one on screen, never over the record
     · a gap between appearances, and a session cap
     · dismissing one holds them off for longer
     · tracks you've already been shown aren't repeated in a session */
var promoPopup = {
  FIRST_DELAY: 40000,     // let someone actually arrive before selling to them
  GAP: 300000,            // 5 minutes between cards
  DISMISS_GAP: 900000,    // 15 minutes if they closed the last one
  SESSION_CAP: 6,

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
      if (e.target.closest('.pp-why')){
        appNotify('Someone spent riff tokens they mined to show you this track. Mine your own in the ⛏ Mine panel.', 'ok');
      }
    });

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
      var r = await fetch('/api/promotions/next?mode=popup' + (ex ? '&exclude=' + encodeURIComponent(ex) : ''),
                          { cache: 'no-store' });
      if (!r.ok) return;
      var body = await r.json();
      var p = body && body.promotion;
      if (!p) return;                       // nothing live, or its last credit went elsewhere

      var m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(p.url || '');
      if (!m) return;

      this.cur = { id: p.id, ytId: m[1], name: p.label || p.name || m[1], url: p.url };
      this.seen[p.id] = 1;
      this.shown++;

      /* A gig flyer stuck to the wall, with the video's picture pasted onto
         it like a taped-up photo. The title and the three buttons appear when
         the pointer is over it.

         The Promoted chip is not styling. It is the disclosure, so it is
         always shown, sits on the flyer's bottom edge, and is never inside
         the part that dims on hover. */
      this.el.innerHTML =
        "<div class='pp-disc'>"
          + "<div class='pp-sheet'>"
            + "<img class='pp-paper' src='img/promote-poster.webp' alt='' width='150' height='208' draggable='false'>"
            + "<img class='pp-art' src='https://i.ytimg.com/vi/" + m[1] + "/mqdefault.jpg'"
              + " alt='' width='320' height='180'>"
          + "</div>"
          + "<div class='pp-acts'>"
            + "<button class='pp-play' title='Play now' aria-label='Play now'>\u25B6</button>"
            + "<button class='pp-add' title='Add to your playlist' aria-label='Add to your playlist'>\uFF0B</button>"
            + "<button class='pp-close' title='Close' aria-label='Close'>\u2715</button>"
          + "</div>"
        + "</div>"
        + "<span class='pp-tag'>Promoted</span>"
        + "<div class='pp-foot'>"
          + "<div class='pp-name'>" + escapeHtml(this.cur.name) + "</div>"
          + "<button class='pp-why' title='Why am I seeing this?'>why am I seeing this?</button>"
        + "</div>";
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

      var self = this;
      clearTimeout(this._auto);
      this._auto = setTimeout(function(){ self.hide(); }, 25000);   // fades out on its own
    } catch(e){ /* the popup is never worth an error */ }
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
  count(kind){
    if (!this.cur) return;
    try {
      fetch('/api/promo/event', { method:'POST', headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ id: this.cur.id, url: this.cur.url, kind: kind }) });
    } catch(e){}
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
