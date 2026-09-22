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
  },

  async tick(){
    if (this.el.hidden === false) return;                 // one at a time
    if (this.shown >= this.SESSION_CAP) return;
    if (Date.now() < this._next) return;
    if (document.hidden) return;                          // not while tabbed away
    await this.showOne();
  },

  /* Weighted pick: a promotion's chance is proportional to the tokens
     behind it, so a 40-token promotion is shown ~8x as often as a 5. */
  pick(list){
    var pool = list.filter(function(p){ return !this.seen[p.id]; }, this);
    if (!pool.length){ this.seen = {}; pool = list; }      // everything seen: start over
    var total = pool.reduce(function(s, p){ return s + Math.max(1, p.tokens || 1); }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < pool.length; i++){
      r -= Math.max(1, pool[i].tokens || 1);
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  },

  async showOne(){
    try {
      var r = await fetch('/api/promotions');
      if (!r.ok) return;
      var list = await r.json();
      if (!list.length) return;

      var p = this.pick(list);
      var m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(p.url || '');
      if (!m) return;

      this.cur = { id: p.id, ytId: m[1], name: p.name || m[1], url: p.url };
      this.seen[p.id] = 1;
      this.shown++;

      // a small gig poster: art edge to edge, the band's name across the foot,
      // play and add sitting over the artwork
      this.el.innerHTML =
        "<img class='pp-art' src='https://i.ytimg.com/vi/" + m[1] + "/mqdefault.jpg' alt=''>"
        + "<span class='pp-tag'>Promoted</span>"
        + "<button class='pp-close' title='Dismiss'>\u2715</button>"
        + "<div class='pp-acts'>"
          + "<button class='pp-play' title='Play now'>\u25B6</button>"
          + "<button class='pp-add' title='Add to your playlist'>\uFF0B</button>"
        + "</div>"
        + "<div class='pp-foot'>"
          + "<div class='pp-name'>" + escapeHtml(this.cur.name) + "</div>"
          + "<button class='pp-why' title='Why am I seeing this?'>why?</button>"
        + "</div>";
      this.el.style.left = ''; this.el.style.right = '';
      this.el.hidden = false;
      // never over the YouTube player: try the other corner, else skip this one
      if (window.ytGuard && ytGuard.overlaps(this.el)){
        this.el.style.left = 'auto'; this.el.style.right = '76px';
        if (ytGuard.overlaps(this.el)){
          this.el.hidden = true; this.el.style.left = ''; this.el.style.right = '';
          this.shown--; delete this.seen[p.id];            // not shown, so not counted
          this._next = Date.now() + 60000;                 // try again in a minute
          return;
        }
      }
      requestAnimationFrame(function(){ promoPopup.el.classList.add('show'); });

      this.count('view');                                  // an impression, anonymously
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

  /* anonymous counter on the promotion row — no wallet, no id, no history */
  count(kind){
    if (!this.cur) return;
    try {
      fetch('/api/promo/event', { method:'POST', headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ url: this.cur.url, kind: kind }) });
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
