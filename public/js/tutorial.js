/* riffrolled — tutorial.js
   What riffrolled is for, in seven short steps, shown on the real UI.

   The point of the tour is not to document the app. It is to leave one
   idea behind:  you don't have to know what you want to listen to —
   riffrolled is for finding out, and when you find something good you can
   help other people find it too.

       LISTEN → DISCOVER → CHOOSE → PROMOTE

   Each step opens the actual panel it is talking about and outlines it,
   so there is nothing to un-learn afterwards. It runs itself once, on a
   first visit, and is dismissible at every step: once closed it never
   opens itself again (the About & Legal panel has a button for later).
   The card never covers the YouTube player — ytGuard decides that. */

var tourBoss = {

  SETTING: 'tourDone',

  steps: [
    {
      title: 'Welcome to riffrolled',
      body: "You don't have to know what you want to listen to.<br><br>" +
            "This is a record deck for discovering music — not a library you have to fill first, " +
            "and not a playlist somebody else made for you.",
      cta: 'Show me'
    },
    {
      title: 'Listen',
      body: "The easiest way to start is to press <b>▶</b> and see where you end up. " +
            "The record spins, the arm drops, the track plays.<br><br>" +
            "<span class='tt-dim'>⏮ ⏭ or the arrow keys move through the deck. Space plays and pauses.</span>",
      focus: function(){ return document.getElementById('deck'); },
      cta: 'Next'
    },
    {
      title: 'Discover',
      body: "This is where music comes from. <b>Import</b> pulls in a whole channel or playlist at once. " +
            "<b>Database</b> is riffrolled's shared catalogue — everything anyone has added, with the " +
            "📣 promoted tracks at the top.<br><br>" +
            "You are not browsing someone's recommendations. You're rummaging.",
      panel: function(){ return window.importBoss && importBoss.el; },
      also: function(){ return window.dataBoss && dataBoss.el; },
      cta: 'Next'
    },
    {
      title: 'Be the DJ',
      body: "You don't have to mix tracks. <b>You're choosing the journey.</b><br><br>" +
            "Drag tracks into the order you want them. Hit 🎲 <b>Random Mix</b> to have riffrolled " +
            "deal you a set from your own library. 👍 and 👎 as you go — that's what riffrolled " +
            "learns you by.",
      panel: function(){ return window.plBoss && plBoss.currentEl; },
      also: function(){ return window.mixBoss && mixBoss.el; },
      cta: 'Next'
    },
    {
      title: 'Or let an AI DJ',
      body: "Tell the <b>🤖 AI DJ</b> what you're after — <i>“something chilled for working”</i>, " +
            "<i>“only stuff I've never heard”</i> — and it writes you a playlist.<br><br>" +
            "Riffrolled supplies the music. <b>Your AI supplies the taste.</b> You copy a prompt, " +
            "paste it into whichever AI you already use, paste the answer back. No key, no account, " +
            "nothing to pay for.",
      panel: function(){ return window.aiDjBoss && aiDjBoss.el; },
      cta: 'Next'
    },
    {
      title: 'Promote',
      body: "If you discover something you love, don't just listen to it — help other people find it.<br><br>" +
            "⛏ <b>Mine</b> earns riff tokens with your own CPU. 📣 <b>Promote</b> spends them to put a " +
            "track in front of other listeners, in the catalogue and on the poster that slides in now " +
            "and then. You can see what it did: shown, played, liked.<br><br>" +
            "<span class='tt-dim'>Tokens have no cash value. Spending more keeps a track up for longer.</span>",
      panel: function(){ return window.promoBoss && promoBoss.el; },
      also: function(){ return window.mineBoss && mineBoss.el; },
      cta: 'Next'
    },
    {
      title: 'That\'s the whole thing',
      body: "<div class='tt-loop'><span>Listen</span><span>Discover</span><span>Choose</span><span>Promote</span></div>" +
            "Then round again — because what you promote is what somebody else discovers.",
      cta: '▶ Start rolling',
      last: true
    }
  ],

  /* ── first run: only for someone who has never been here ── */
  async init(){
    try {
      if (await dbBoss.getSetting(this.SETTING)) return;      // seen it already
      if ((await db.tracks.count()) > 0){                      // returning user: don't interrupt
        await dbBoss.setSetting(this.SETTING, '1');
        return;
      }
    } catch(e){ return; }
    var self = this;
    setTimeout(function(){ self.start(); }, 900);              // let the deck settle first
  },

  start(from){
    this.i = from || 0;
    if (!this.el) this.build();
    // remember which panels were open, so the tour can put the screen back
    // the way it found it — a tour that leaves seven panels open has made
    // a mess of the thing it was explaining
    this._before = (window.dock ? dock.items : []).map(function(it){
      return { el: it.el, hidden: it.el ? it.el.classList.contains('is-hidden') : true };
    });
    this.el.hidden = false;
    document.body.classList.add('tour-on');
    this.render();
  },

  build(){
    var el = document.createElement('div');
    el.className = 'tour-card';
    el.id = 'tourCard';
    el.hidden = true;
    el.innerHTML =
      "<button class='tt-x' title='Close' aria-label='Close the tour'>✕</button>" +
      "<div class='tt-step'></div>" +
      "<div class='tt-title'></div>" +
      "<div class='tt-body'></div>" +
      "<div class='tt-foot'>" +
        "<button class='tt-back'>Back</button>" +
        "<span class='tt-dots'></span>" +
        "<button class='tt-next'></button>" +
      "</div>";
    document.body.appendChild(el);
    this.el = el;

    var self = this;
    el.querySelector('.tt-x').onclick = function(){ self.close(); };
    el.querySelector('.tt-back').onclick = function(){ self.go(-1); };
    el.querySelector('.tt-next').onclick = function(){ self.go(1); };
    el.querySelector('.tt-dots').addEventListener('click', function(e){
      var d = e.target.closest('.tt-dot'); if (!d) return;
      self.i = Number(d.dataset.i); self.render();
    });
    document.addEventListener('keydown', function(e){
      if (el.hidden) return;
      if (e.key === 'Escape') self.close();
      else if (e.key === 'ArrowRight') self.go(1);
      else if (e.key === 'ArrowLeft') self.go(-1);
    });
    window.addEventListener('resize', function(){ if (!el.hidden) self.place(); });
  },

  go(d){
    var next = this.i + d;
    if (next < 0) return;
    if (next >= this.steps.length){ this.finish(); return; }
    this.i = next;
    this.render();
  },

  render(){
    var s = this.steps[this.i], el = this.el;
    el.querySelector('.tt-step').textContent = 'Step ' + (this.i + 1) + ' of ' + this.steps.length;
    el.querySelector('.tt-title').textContent = s.title;
    el.querySelector('.tt-body').innerHTML = s.body;
    el.querySelector('.tt-next').textContent = s.cta || 'Next';
    el.querySelector('.tt-back').style.visibility = this.i ? 'visible' : 'hidden';
    el.classList.toggle('tt-final', !!s.last);

    var self = this;
    el.querySelector('.tt-dots').innerHTML = this.steps.map(function(x, i){
      return "<button class='tt-dot" + (i === self.i ? ' on' : '') + "' data-i='" + i +
             "' title='" + escapeHtml(x.title) + "' aria-label='" + escapeHtml(x.title) + "'></button>";
    }).join('');

    this.spotlight(s);
    this.place();
  },

  /* open the panels this step is about, and outline them — the tour
     teaches the real UI, so the real UI has to be on screen */
  spotlight(s){
    document.querySelectorAll('.tour-spot').forEach(function(e){ e.classList.remove('tour-spot'); });
    var self = this;
    var targets = [];
    [s.panel, s.also].forEach(function(fn){
      var el = fn && fn();
      if (!el) return;
      if (window.dock) dock.openPanel(el);
      targets.push(el);
    });

    // close what the previous step opened: one step, one subject. Panels
    // the user already had open before the tour started are left alone.
    if (window.dock && this._opened){
      this._opened.forEach(function(el){
        if (targets.indexOf(el) === -1 && !self._wasOpen(el)) dock.setHidden(el, true);
      });
    }
    this._opened = targets.slice();

    var focus = s.focus && s.focus();
    if (focus) targets.push(focus);
    targets.forEach(function(el){ el.classList.add('tour-spot'); });
    this._targets = targets;
  },

  _wasOpen(el){
    var before = (this._before || []).find(function(p){ return p.el === el; });
    return !!(before && !before.hidden);
  },

  /* bottom-left by default, out of the way of the dock and the deck.
     ytGuard has the last word: the YouTube player is never covered. */
  place(){
    var el = this.el;
    el.style.left = ''; el.style.right = ''; el.style.top = ''; el.style.bottom = '';
    if (document.body.classList.contains('mobile')) return;    // CSS handles phones
    el.style.left = '20px';
    el.style.bottom = '20px';
    if (window.ytGuard && ytGuard.overlaps(el)){
      el.style.bottom = '';
      el.style.top = '20px';
      if (ytGuard.overlaps(el)){ el.style.top = ''; el.style.bottom = '20px'; el.style.left = '8px'; }
    }
  },

  close(){ this.dismiss('closed'); },

  /* START ROLLING: tidy up, then leave them somewhere worth being —
     playing, if there is anything to play, and at Import if not, since an
     empty library is the one thing that stops riffrolled working */
  finish(){
    var hasMusic = window.plBoss && plBoss.queue && plBoss.queue.length;
    var keep = (!hasMusic && window.importBoss) ? importBoss.el : null;
    this.dismiss(keep);
    if (hasMusic){
      if (!player.currentYtId) plBoss.playIndex(0);
      else if (!player.isPlaying) player.resume();
    } else if (keep && window.dock){
      dock.openPanel(keep);
    }
  },

  dismiss(keepOpen){
    if (this.el) this.el.hidden = true;
    document.body.classList.remove('tour-on');
    document.querySelectorAll('.tour-spot').forEach(function(e){ e.classList.remove('tour-spot'); });

    // close whatever the tour opened (but never the panel the last step
    // handed over to, if it asked to keep one)
    if (this._before && window.dock){
      this._before.forEach(function(p){
        if (p.el && p.hidden && p.el !== keepOpen) dock.setHidden(p.el, true);
      });
      this._before = null;
    }
    if (window.dbBoss) dbBoss.setSetting(this.SETTING, '1');   // never auto-opens again
  }
};

// first visit only; the About & Legal panel can reopen it any time
window.addEventListener('load', function(){ tourBoss.init(); });
