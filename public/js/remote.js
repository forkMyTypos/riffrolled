/* riffrolled — remote.js
   The round remote: prev, play, next, the repeat menu and Track info in a
   puck you can drop anywhere on a desktop.

   IT REPLACES THE DECK'S ROW OF BUTTONS, IT DOES NOT ADD TO IT

   Two sets of play buttons that can disagree is a bug factory, so there is
   one set. It is the same DOM as before — same ids (#btnPlay, #btnPrev,
   #btnNext, #btnCtl, #ctlMenu), same handlers bound by playlist.js — only
   moved and restyled. Nothing that drove the old row needs to know.

   DESKTOP: the node is moved to <body> and floats, because the deck's
   np-area has a transform and a transformed ancestor would make
   `position: fixed` mean "relative to the deck". Drag it by anything that
   is not a button. Where you drop it is remembered.

   PHONE: it stays in the deck, in the flow, as the row it was. Dragging a
   thing around a screen you scroll with the same finger is a fight you
   lose, and a finger is not a mouse. It never moves there.

   THE YOUTUBE PLAYER: nothing may cover it. The remote is allowed to be
   dragged across it (a drag that refuses to go somewhere is infuriating)
   but when it is let go over the player it slides to the nearest clear
   spot, and ytGuard asks it to do the same if the player ever grows into
   it. */

var remote = {
  SIZE: 152,
  GAP: 16,            // clearance kept between the remote and the video
  SETTING: 'remotePos',

  el: null,
  floating: false,
  pos: null,          // { x, y } in viewport pixels, once placed
  _saved: null,       // the position the person chose, if they chose one
  _drag: null,

  boot(){
    this.el = document.getElementById('remote');
    if (!this.el) return this;
    var self = this;

    // dragging: anything that is not a control
    this.el.addEventListener('pointerdown', function(e){
      if (!self.floating || e.button !== 0) return;
      if (e.target.closest('button, .t-menu, a, input')) return;
      self._drag = { dx: e.clientX - self.pos.x, dy: e.clientY - self.pos.y, moved: false, id: e.pointerId };
      try { self.el.setPointerCapture(e.pointerId); } catch(err){}
      self.el.classList.add('dragging');
      e.preventDefault();
    });
    this.el.addEventListener('pointermove', function(e){
      var d = self._drag; if (!d || d.id !== e.pointerId) return;
      d.moved = true;
      self.moveTo(e.clientX - d.dx, e.clientY - d.dy);
    });
    var end = function(e){
      var d = self._drag; if (!d || (e && d.id !== e.pointerId)) return;
      self._drag = null;
      self.el.classList.remove('dragging');
      if (!d.moved) return;
      self.avoidPlayer();
      self._saved = { x: self.pos.x, y: self.pos.y };
      self.save();
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);

    // keyboard: a draggable thing nobody can move without a mouse is a trap
    this.el.addEventListener('keydown', function(e){
      if (!self.floating || e.target.closest('input')) return;
      if (!e.altKey || !/^Arrow/.test(e.key)) return;
      var step = e.shiftKey ? 40 : 12;
      var dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      var dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      self.moveTo(self.pos.x + dx, self.pos.y + dy);
      self._saved = { x: self.pos.x, y: self.pos.y };
      self.avoidPlayer(); self.save();
      e.preventDefault();
    });

    // the repeat menu opens upward, or downward when there is no room above
    var btn = document.getElementById('btnCtl');
    if (btn) btn.addEventListener('click', function(){
      var menu = document.getElementById('ctlMenu');
      if (!menu) return;
      setTimeout(function(){ menu.classList.toggle('below', self.floating && self.pos.y < 300); }, 0);
    });

    // the info button: Track info for whatever is playing
    var info = document.getElementById('btnInfo');
    if (info) info.addEventListener('click', function(){
      if (window.trackInfo){
        if (window.player && player.currentYtId) trackInfo.show(player.currentYtId);
        else if (window.dock) dock.openPanel(trackInfo.el);
      }
    });

    window.addEventListener('resize', function(){ if (self.floating) self.place(); });
    window.addEventListener('rr:videosize', function(){
      if (!self.floating) return;
      // nobody has chosen a spot: keep the default beside the (now bigger) record
      if (!self._saved) self.place(); else self.avoidPlayer();
    });

    // remembered position, once the settings table can be read
    if (window.dbBoss){
      dbBoss.getSetting(this.SETTING).then(function(raw){
        try {
          var p = raw ? JSON.parse(raw) : null;
          if (p && isFinite(p.x) && isFinite(p.y)){ self._saved = { x: +p.x, y: +p.y }; if (self.floating) self.place(); }
        } catch(err){}
      }).catch(function(){});
    }
    return this;
  },

  /** Desktop floats; a phone keeps the row in the deck. Called by dock.setMode. */
  mount(isMobile){
    if (!this.el) return;
    if (isMobile){
      this.floating = false;
      this.el.classList.remove('floating', 'dragging');
      this.el.style.left = this.el.style.top = '';
      var row = document.querySelector('.np-area .np-titlerow');
      if (row && this.el.parentNode !== row.parentNode) row.parentNode.insertBefore(this.el, row.nextSibling);
      return;
    }
    this.floating = true;
    if (this.el.parentNode !== document.body) document.body.appendChild(this.el);
    this.el.classList.add('floating');
    this.place();
  },

  /** Where it goes when nobody has chosen: beside the record, level with its base. */
  defaultPos(){
    var plinth = document.querySelector('#deck .plinth');
    var vw = window.innerWidth, vh = window.innerHeight, S = this.SIZE;
    var bar = document.querySelector('.rightM');
    var dockLeft = bar ? bar.getBoundingClientRect().left : vw;
    if (!plinth) return { x: 16, y: vh - S - 16 };
    var r = plinth.getBoundingClientRect();
    var y = Math.min(vh - S - 12, r.bottom - S - 8);
    if (r.left - S - 18 >= 8) return { x: r.left - S - 18, y: y };            // room on the left
    if (r.right + 18 + S <= dockLeft - 8) return { x: r.right + 18, y: y };   // else the right
    return { x: Math.round(r.left + (r.width - S) / 2), y: vh - S - 12 };     // else along the bottom
  },

  place(){
    var p = this._saved || this.defaultPos();
    this.moveTo(p.x, p.y);
    this.avoidPlayer();
  },

  moveTo(x, y){
    var S = this.SIZE, vw = window.innerWidth, vh = window.innerHeight;
    x = Math.max(6, Math.min(vw - S - 6, Math.round(x)));
    y = Math.max(6, Math.min(vh - S - 6, Math.round(y)));
    this.pos = { x: x, y: y };
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
  },

  /**
   * If the remote is over the video, slide it to the nearest clear spot.
   * Returns true when it moved. Never throws, never loops.
   */
  avoidPlayer(){
    if (!this.floating || !window.ytGuard) return false;
    var v = ytGuard.rect(); if (!v) return false;
    var S = this.SIZE, G = this.GAP, vw = window.innerWidth, vh = window.innerHeight;
    var hit = function(x, y){
      return x < v.right + G && x + S > v.left - G && y < v.bottom + G && y + S > v.top - G;
    };
    var x = this.pos.x, y = this.pos.y;
    if (!hit(x, y)) return false;

    var tries = [
      [x, v.bottom + G],            // below
      [x, v.top - G - S],           // above
      [v.right + G, y],             // right of it
      [v.left - G - S, y]           // left of it
    ].filter(function(c){ return c[0] >= 6 && c[1] >= 6 && c[0] + S <= vw - 6 && c[1] + S <= vh - 6 && !hit(c[0], c[1]); });

    if (!tries.length){
      // nowhere fits (a tiny window): fall back to a corner of the screen
      tries = [[6, vh - S - 6], [vw - S - 6, vh - S - 6], [6, 6], [vw - S - 6, 6]]
        .filter(function(c){ return !hit(c[0], c[1]); });
      if (!tries.length) return false;
    }
    tries.sort(function(a, b){
      return Math.hypot(a[0] - x, a[1] - y) - Math.hypot(b[0] - x, b[1] - y);
    });
    this.moveTo(tries[0][0], tries[0][1]);
    return true;
  },

  save(){
    if (!window.dbBoss || !this._saved) return;
    clearTimeout(this._t);
    var s = JSON.stringify(this._saved);
    this._t = setTimeout(function(){ dbBoss.setSetting(remote.SETTING, s); }, 300);
  }
};
remote.boot();
