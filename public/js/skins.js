/* riffrolled — skins.js
   Record-player skins: a few different finishes for the same turntable.

     < [record player] >    two arrows hang off the plinth's left and right
                            edges, and only while the pointer is over the
                            record player. Click to step through the skins.

   A skin is two attributes on #deck (css/skins.css does the rest):
     data-skin    the finish    studio · walnut · neon · chrome · classic
     data-layout  where the controls go    deck · strip · inline
   remote.js moves the controls to suit the layout.

   THE PHONE has no hover and no room for arrows: it always gets the studio
   skin. The choice is per device (a setting), never sent anywhere.

   WHY HOVER IS TRACKED HERE AND NOT WITH :hover
     #deck ignores the mouse so panels behind its empty areas stay clickable;
     the plinth never receives pointer events. So the pointer's position is
     compared with the plinth's rectangle instead. */

var skinBoss = {
  SETTING: 'deckSkin',
  LIST: [
    { id: 'studio',  name: 'Studio',  layout: 'deck'   },
    { id: 'walnut',  name: 'Walnut',  layout: 'deck'   },
    { id: 'neon',    name: 'Neon',    layout: 'deck'   },
    { id: 'chrome',  name: 'Chrome',  layout: 'strip'  },
    { id: 'classic', name: 'Classic', layout: 'inline' }
  ],
  EDGE: 48,            // the arrows hang this far outside the plinth
  current: 'studio',

  deck: null, plinth: null, prev: null, next: null, label: null,
  _off: null, _say: null,

  find(id){
    for (var i = 0; i < this.LIST.length; i++) if (this.LIST[i].id === id) return i;
    return -1;
  },

  /** The skin actually shown: phones always get the first (studio). */
  effective(isMobile){
    return isMobile ? this.LIST[0] : this.LIST[Math.max(0, this.find(this.current))];
  },

  /** Put the attributes on the deck; returns the layout so remote.js can place the controls. */
  sync(isMobile){
    var s = this.effective(isMobile);
    if (this.deck){ this.deck.setAttribute('data-skin', s.id); this.deck.setAttribute('data-layout', s.layout); }
    return s.layout;
  },

  set(id, persist, announce){
    var i = this.find(id); if (i < 0) return;
    this.current = id;
    var mob = !!(window.dock && dock.mobile);
    this.sync(mob);
    if (window.remote) remote.mount(mob);
    if (window.remote && remote.placeMenu) remote.placeMenu();
    this.updateTitles();
    if (persist && window.dbBoss) dbBoss.setSetting(this.SETTING, id);
    if (announce) this.say(this.LIST[i].name);
    window.dispatchEvent(new CustomEvent('rr:skin', { detail: { id: id } }));
  },

  step(dir){
    var i = this.find(this.current), n = this.LIST.length;
    this.set(this.LIST[(i + dir + n) % n].id, true, true);
  },

  /** Name the neighbours on the arrows' tooltips. */
  updateTitles(){
    if (!this.prev) return;
    var i = this.find(this.current), n = this.LIST.length;
    this.prev.title = 'Previous skin: ' + this.LIST[(i - 1 + n) % n].name;
    this.next.title = 'Next skin: ' + this.LIST[(i + 1) % n].name;
    this.prev.setAttribute('aria-label', this.prev.title);
    this.next.setAttribute('aria-label', this.next.title);
  },

  say(text){
    if (!this.label) return;
    this.label.textContent = text;
    this.label.classList.add('show');
    clearTimeout(this._say);
    var self = this;
    this._say = setTimeout(function(){ self.label.classList.remove('show'); }, 1300);
  },

  boot(){
    this.deck = document.getElementById('deck');
    this.plinth = document.querySelector('#deck .plinth');
    if (!this.deck || !this.plinth) return this;
    var self = this;

    function arrow(cls, glyph, dir){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'skin-nav ' + cls; b.textContent = glyph;
      b.setAttribute('data-testid', 'skin-' + cls);
      b.addEventListener('click', function(){ self.step(dir); });
      self.plinth.appendChild(b);
      return b;
    }
    this.prev = arrow('prev', '‹', -1);
    this.next = arrow('next', '›', 1);
    this.label = document.createElement('div');
    this.label.className = 'skin-name'; this.label.setAttribute('role', 'status');
    this.label.setAttribute('data-testid', 'skin-name');
    this.plinth.appendChild(this.label);
    this.updateTitles();

    // the arrows are there only while the pointer is over the record player
    var show = function(on){
      clearTimeout(self._off);
      if (on) self.deck.classList.add('skin-hover');
      else self._off = setTimeout(function(){ self.deck.classList.remove('skin-hover'); }, 220);
    };
    document.addEventListener('pointermove', function(e){
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (window.dock && dock.mobile) return;
      var r = self.plinth.getBoundingClientRect(), E = self.EDGE;
      show(e.clientX >= r.left - E && e.clientX <= r.right + E && e.clientY >= r.top && e.clientY <= r.bottom);
    });
    document.documentElement.addEventListener('mouseleave', function(){ show(false); });

    // remembered choice
    if (window.dbBoss){
      dbBoss.getSetting(this.SETTING).then(function(raw){
        if (raw && self.find(raw) >= 0 && raw !== self.current) self.set(raw, false, false);
      }).catch(function(){});
    }
    this.sync(!!(window.dock && dock.mobile));
    return this;
  }
};
skinBoss.boot();
