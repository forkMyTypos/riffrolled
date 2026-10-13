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
     The handle sits outside the video's corner, never on it — YouTube's
     own fullscreen button lives there and nothing may cover the player.
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
      // the video grows from its centre, so its corner moves half as far
      // as its side grows: a pointer that travelled (dx, dy) means a side
      // that grew by dx + dy
      self.set(d.start + (e.clientX - d.x) + (e.clientY - d.y), false);
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

  /** The largest side this window can hold: the record is 21rem bigger than the video. */
  max(){
    var rem = 16;
    var byHeight = window.innerHeight - 21 * rem - 64;
    var byWidth = window.innerWidth - 90 - 21 * rem - 64;       // the dock rail, then the record's margins
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
