/* riffrolled — screen.js
   Resizing the video.

   The record is built around the video (deck.css sizes the plinth,
   turntable and platter from --vid), so this only has to change one
   number and the rest of the turntable follows, with the video staying in
   the middle of it.

   THE LIMITS ARE NOT NEGOTIABLE
     · never below 200px: YouTube requires it of an embedded player
     · never so large the record leaves the screen: the ceiling is worked
       out from the window, so a laptop gets a smaller maximum than a
       monitor, and shrinking the window pulls the video back in

   WHAT IT MUST NOT DO
     The handle is the record player's own lower-right corner — invisible,
     with a tooltip and a resize cursor — never on the video, where YouTube's
     own fullscreen button lives.
     Phones do not resize (mobile.css pins --vid to 200). */

var screenSize = {
  MIN: 200,
  CAP: 420,
  DEFAULT: 200,
  SETTING: 'videoSize',

  size: 200,          // what the person chose
  _drag: null,

  boot(){
    this.deck = document.getElementById('deck');
    this.grip = document.getElementById('screenGrip');
    if (!this.deck || !this.grip) return this;
    var self = this;

    this.grip.addEventListener('pointerdown', function(e){
      if (e.button !== 0) return;
      self._drag = { x: e.clientX, y: e.clientY, start: self.size, id: e.pointerId };
      try { self.grip.setPointerCapture(e.pointerId); } catch(err){}
      self.grip.classList.add('dragging');
      self.deck.classList.add('resizing');
      e.preventDefault();
    });
    this.grip.addEventListener('pointermove', function(e){
      var d = self._drag; if (!d || d.id !== e.pointerId) return;
      // the record player is anchored at the left and centred vertically, so
      // its lower-right corner moves by the growth across, and by half of it
      // down: a pointer that follows the corner has travelled (dx, dy) with
      // growth = dx = 2·dy. Averaging the two estimates is steady either way.
      self.set(d.start + ((e.clientX - d.x) + 2 * (e.clientY - d.y)) / 2, false);
    });
    var end = function(e){
      var d = self._drag; if (!d || (e && d.id !== e.pointerId)) return;
      self._drag = null;
      self.grip.classList.remove('dragging');
      self.deck.classList.remove('resizing');
      self.save();
    };
    this.grip.addEventListener('pointerup', end);
    this.grip.addEventListener('pointercancel', end);

    this.grip.addEventListener('dblclick', function(){ self.set(self.DEFAULT, true); });
    this.grip.addEventListener('keydown', function(e){
      var step = e.shiftKey ? 40 : 10, to = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') to = self.size + step;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') to = self.size - step;
      else if (e.key === 'Home') to = self.MIN;
      else if (e.key === 'End') to = self.max();
      if (to === null) return;
      e.preventDefault();
      self.set(to, true);
    });

    // a smaller window pulls a big video back in (without forgetting what was chosen)
    window.addEventListener('resize', function(){ self.apply(); });

    if (window.dbBoss){
      dbBoss.getSetting(this.SETTING).then(function(raw){
        var n = Number(raw);
        if (isFinite(n) && n >= self.MIN){ self.size = n; self.apply(); }
      }).catch(function(){});
    }
    this.apply();
    return this;
  },

  /** The largest video this window can hold: the record player is 376px bigger than the video. */
  max(){
    var byHeight = window.innerHeight - 376 - 64;
    var byWidth = window.innerWidth - 90 - 376 - 64 - 48;  // the dock rail, then the record's margins (80px on its left)
    return Math.max(this.MIN, Math.min(this.CAP, Math.floor(byHeight), Math.floor(byWidth)));
  },

  /** What is actually shown: the choice, held between the limits. */
  shown(){ return Math.max(this.MIN, Math.min(this.max(), Math.round(this.size))); },

  set(n, persist){
    this.size = Math.max(this.MIN, Math.min(this.max(), Math.round(Number(n) || this.DEFAULT)));
    this.apply();
    if (persist) this.save();
  },

  apply(){
    if (!this.deck) return;
    var n = this.shown();
    this.deck.style.setProperty('--vid', n + 'px');
    this.grip.setAttribute('aria-valuenow', String(n));
    this.grip.setAttribute('aria-valuemax', String(this.max()));
    document.documentElement.setAttribute('data-rr-video', String(n));
    window.dispatchEvent(new Event('rr:videosize'));
  },

  save(){
    if (!window.dbBoss) return;
    clearTimeout(this._t);
    var n = this.size;
    this._t = setTimeout(function(){ dbBoss.setSetting(screenSize.SETTING, String(n)); }, 300);
  }
};
screenSize.boot();
