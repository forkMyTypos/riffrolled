/* riffrolled — dock.js
   Boot sequence, the dock rail (desktop) and tab bar (mobile),
   layout persistence. Must load last: it wires everything together. */

plBoss.setup();
searchBoss.setup();
importBoss.setup();
dataBoss.setup();
mineBoss.setup();
promoBoss.setup();
mixBoss.setup();
infoBoss.setup();



/* ── DOCK: right-hand sidebar of on/off panel toggles (desktop only).
   On mobile the panels just stack and scroll, so the dock hides and all show. ── */
var dock = {
  items: [],
  mobile: false,
  _ready: false,   // don't persist until the saved layout has been restored
  _data: null,     // last-known layout map (kept fresh on save)
  _t: null,        // debounce timer
  _placed: null,   // Set of labels the user has dragged (their position is respected)

  build(items){ this.items = items; this.render(); },

  render(){
    const bar = document.querySelector('.rightM');
    if (!bar) return;
    bar.innerHTML = '';

    if (this.mobile){
      // app-style bottom tabs: Player first, then one tab per panel
      this._mBtns = [];
      const tabs = [{ icon:'🎛', label:'Player', short:'Player', player:true }]
        .concat(this.items.map(it => ({ ...it, short: this.shortLabel(it.label) })));
      tabs.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'dock-btn';
        btn.title = t.label;
        btn.setAttribute('aria-label', t.label);
        if (t.iconSvg) btn.innerHTML = t.iconSvg; else btn.textContent = t.icon;
        if (t.accent) btn.style.setProperty('--accent', t.accent);
        const lbl = document.createElement('span');
        lbl.className = 'dock-lbl';
        lbl.textContent = t.short;
        btn.appendChild(lbl);
        btn.onclick = () => this.showMobile(t.player ? 'player' : t.label);
        this._mBtns.push([t.player ? 'player' : t.label, btn]);
        bar.appendChild(btn);
        if (!t.player) t.btn = btn;
      });
      return;
    }

    this.items.forEach((it, idx) => {
      if (!it.el) return;
      // hairline between groups: finding music · the token economy · everything else
      if (idx > 0 && it.group && it.group !== this.items[idx - 1].group){
        const sep = document.createElement('span');
        sep.className = 'dock-sep';
        bar.appendChild(sep);
      }
      const btn = document.createElement('button');
      btn.className = 'dock-btn';
      btn.title = it.label;
      if (it.iconSvg) btn.innerHTML = it.iconSvg; else btn.textContent = it.icon;
      const lbl = document.createElement('span');     // icons alone made people guess
      lbl.className = 'dock-lbl';
      lbl.textContent = this.shortLabel(it.label);
      btn.appendChild(lbl);
      if (it.accent) btn.style.setProperty('--accent', it.accent);
      if (it.bottom) btn.classList.add('dock-bottom');   // pinned to the rail's end
      btn.setAttribute('aria-label', it.label);
      it.btn = btn;
      if (!it._init){ it._init = true; it.el.classList.toggle('is-hidden', !!it.startHidden); }
      const hidden = it.el.classList.contains('is-hidden');
      btn.classList.toggle('active', !hidden);
      btn.setAttribute('aria-pressed', String(!hidden));
      btn.onclick = () => {
        if (it.el.classList.contains('is-hidden')) this.openPanel(it.el);
        else this.setHidden(it.el, true);
      };
      bar.appendChild(btn);
    });
  },

  // open a panel: show it, keep it within view, and tuck it tidily near the dock
  // unless the user has dragged it themselves (then we honour their position)
  openPanel(el){
    if (!el) return;
    el.classList.remove('is-hidden');
    const it = this.items.find(i => i.el === el);
    if (it && it.btn){ it.btn.classList.add('active'); it.btn.setAttribute('aria-pressed','true'); }
    if (!this.mobile){
      if (this.isPlaced(el)) this.ensureVisible(el);
      else this.autoPlace(el);
      bringToFront(el);
    } else {
      const it = this.items.find(i => i.el === el);
      if (it) this.showMobile(it.label);
    }
    this.saveLayoutSoon();
  },

  isPlaced(el){
    const it = this.items.find(i => i.el === el);
    return !!(it && this._placed && this._placed.has(it.label));
  },
  markPlaced(el){
    const it = this.items.find(i => i.el === el);
    if (!it) return;
    if (!this._placed) this._placed = new Set();
    if (!this._placed.has(it.label)){
      this._placed.add(it.label);
      if (window.dbBoss) dbBoss.setSetting('placedPanels', JSON.stringify([...this._placed]));
    }
  },

  // tidy auto-position: cascade from just-left-of-the-dock, avoiding other open panels, clamped on-screen
  autoPlace(el){
    if (this.mobile) return;
    const bar = document.querySelector('.rightM');
    const dockLeft = bar ? bar.getBoundingClientRect().left : window.innerWidth;
    const w = el.offsetWidth || 300, h = el.offsetHeight || 260, gap = 14, step = 30;
    const baseLeft = Math.max(8, dockLeft - w - gap);
    const baseTop = window.scrollY + 16;
    const minLeft = Math.max(8, dockLeft - 2 * w - 2 * gap);   // stay within ~2 columns of the dock
    const others = this.items.map(i => i.el).filter(e => e && e !== el && !e.classList.contains('is-hidden'));
    const occupied = (x, y) => others.some(e => {
      const r = e.getBoundingClientRect();
      return Math.abs((r.left + window.scrollX) - x) < step && Math.abs((r.top + window.scrollY) - y) < step;
    });
    let left = baseLeft, top = baseTop, n = 0;
    while (occupied(left, top) && n < 12){
      left -= step; top += step; n++;
      if (left < minLeft || top + h > window.scrollY + window.innerHeight - 8){ left = baseLeft; top = baseTop; break; }
    }
    left = Math.min(Math.max(8, left), dockLeft - w - gap);
    top  = Math.max(window.scrollY + 8, Math.min(top, window.scrollY + window.innerHeight - Math.min(h, window.innerHeight - 40)));
    el.style.left = left + 'px';
    el.style.right = 'auto';
    el.style.top = top + 'px';
  },

  // if a panel would open off-screen (e.g. a stale saved position, or a smaller window),
  // pull it back into view, tucked just left of the dock
  ensureVisible(el){
    if (!el || this.mobile) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, m = 40;
    const offscreen = r.left > vw - m || r.right < m || r.top > vh - m || r.bottom < m || r.left < 0 || r.top < 0;
    if (!offscreen) return;
    const bar = document.querySelector('.rightM');
    const dockLeft = bar ? bar.getBoundingClientRect().left : vw;
    const w = r.width || 300;
    el.style.left = Math.max(12, dockLeft - w - 16) + 'px';
    el.style.right = 'auto';
    el.style.top = (window.scrollY + 16) + 'px';
    this.saveLayoutSoon();
  },

  ensureAllVisible(){
    if (this.mobile) return;
    this.items.forEach(it => { if (it.el && !it.el.classList.contains('is-hidden')) this.ensureVisible(it.el); });
  },

  shortLabel(label){
    return { 'Current Track':'Track', 'About & Legal':'About', 'Database':'Data', 'Random Mix':'Mix', 'Promote':'Promo' }[label] || label.split(' ')[0];
  },

  // mobile: show exactly one view — 'player' (the deck) or a panel by label
  showMobile(label){
    this._mActive = label;
    document.body.classList.toggle('m-view-panel', label !== 'player');
    this.items.forEach(it => { if (it.el) it.el.classList.toggle('m-active', it.label === label); });
    if (this._mBtns) this._mBtns.forEach(([l, b]) => b.classList.toggle('active', l === label));
  },

  setMode(isMobile){
    this.mobile = isMobile;
    this.render();
    if (isMobile){
      this.showMobile(this._mActive || 'player');
      return;
    }
    // back to desktop: clear mobile view state, restore floating layout
    document.body.classList.remove('m-view-panel');
    this.items.forEach(it => { if (it.el) it.el.classList.remove('m-active'); });
    if (!isMobile){
      // re-assert positions after a mode switch: saved layout if any, else the near-dock defaults
      if (this._data) this.applyLayout(this._data);
      else if (this._ready) this.applyDefaultLayout();
      this.ensureAllVisible();
    }
  },

  // the designed default: panels anchored near the dock (right-side columns), like a fresh install
  applyDefaultLayout(){
    if (this.mobile) return;
    const pos = {
      'Import':           { right:'450px', top:'48px' },
      'Playlist':         { right:'92px',  top:'48px' }
    };
    this.items.forEach(it => {
      const p = pos[it.label];
      if (!p || !it.el) return;
      it.el.style.left = 'auto';
      it.el.style.right = p.right;
      it.el.style.top = p.top;
    });
    this.ensureAllVisible();
  },

  // used by panel ✕ close buttons: hide a panel and keep its dock toggle in sync
  setHidden(el, hidden){
    if (!el) return;
    el.classList.toggle('is-hidden', hidden);
    const it = this.items.find(i => i.el === el);
    if (it && it.btn){ it.btn.classList.toggle('active', !hidden); it.btn.setAttribute('aria-pressed', String(!hidden)); }
    this.saveLayoutSoon();
  },

  // ── layout persistence (per-panel position, size, open/closed → settings table) ──
  snapshot(){
    const data = {};
    this.items.forEach(it => {
      if (!it.el) return;
      const s = it.el.style;
      data[it.label] = {
        left: s.left || '', top: s.top || '', right: s.right || '',
        width: s.width || '', height: s.height || '',
        hidden: it.el.classList.contains('is-hidden')
      };
    });
    return data;
  },

  saveLayout(){
    if (!this._ready || this.mobile) return;   // mobile uses the stacked layout — never overwrite desktop positions
    this._data = this.snapshot();
    if (window.dbBoss) dbBoss.setSetting('panelLayout', JSON.stringify(this._data));
  },

  saveLayoutSoon(){
    if (!this._ready) return;
    clearTimeout(this._t);
    this._t = setTimeout(() => this.saveLayout(), 400);
  },

  applyLayout(data){
    this.items.forEach(it => {
      const d = data[it.label];
      if (!d || !it.el) return;
      const s = it.el.style;
      if (d.left)  { s.left = d.left; s.right = 'auto'; }
      else if (d.right) { s.right = d.right; s.left = 'auto'; }
      if (d.top)    s.top = d.top;
      if (d.width)  s.width = d.width;
      if (d.height) s.height = d.height;
      if (!this.mobile){                         // visibility only matters on desktop; mobile shows all
        it.el.classList.toggle('is-hidden', !!d.hidden);
        if (it.btn) it.btn.classList.toggle('active', !d.hidden);
      }
    });
  },

  // restore saved layout (if any), then start tracking changes
  init(){
    const done = () => {
      this._ready = true;
      if (window.ResizeObserver){
        const ro = new ResizeObserver(() => this.saveLayoutSoon());
        this.items.forEach(it => { if (it.el) ro.observe(it.el); });
      }
    };
    if (!window.dbBoss){ done(); return; }
    Promise.all([ dbBoss.getSetting('panelLayout'), dbBoss.getSetting('placedPanels') ]).then(arr => {
      const raw = arr[0], placedRaw = arr[1];
      try { this._placed = new Set(placedRaw ? JSON.parse(placedRaw) : []); } catch(e){ this._placed = new Set(); }
      if (raw){
        try { this._data = JSON.parse(raw); } catch(e){ this._data = null; }
        if (this._data) this.applyLayout(this._data);
      }
      if (!this._data && !this.mobile) this.applyDefaultLayout();
      this.ensureAllVisible();
      done();
    }).catch(done);
  }
};

// ✕ on any panel header closes it (delegated so it works for every panel)
document.addEventListener('click', function(e){
  const x = e.target.closest && e.target.closest('.panel-close');
  if (!x) return;
  const panel = x.closest('.panel');
  if (panel) dock.setHidden(panel, true);
});

// the Current Track panel is static markup; give it the same drag + default placement as the rest
(function(){
  const ct = document.getElementById('ctPanel');
  if (ct){
    makeDraggableEle(ct, ct.querySelector('.panel-header'));
    menuB.place(ct, { right:'470px', top:'452px', width:'300px' });
  }
})();

dock.build([
  // ── music: finding, adding and holding tracks. Each panel owns a hue so
  //    you can tell at a glance which one you're looking at. ──
  { iconSvg: PLAYLIST_SVG, label:'Playlist', el: plBoss.currentEl, group:'music', accent:'#9d8cff' },
  { icon:'🔎', label:'Search',           el: searchBoss.el, startHidden:true, group:'music', accent:'#4db8ff' },
  { icon:'▶', iconSvg: YT_ICON_SVG, label:'Import', el: importBoss.el, group:'music', accent:'#ff5d6c' },
  { icon:'🗄', iconSvg: DB_ICON_SVG.replace(/dbg/g, 'dbgD'), label:'Database', el: dataBoss.el, startHidden:true, group:'music', accent:'#46e0ff' },
  { icon:'🎲', iconSvg: MIX_DICE_SVG.replace(/mxg/g, 'mxgD'), label:'Random Mix', el: mixBoss.el, startHidden:true, group:'music', accent:'#5ad1a0' },
  { icon:'💿', label:'Current Track',    el: document.getElementById('ctPanel'), startHidden:true, group:'music', accent:'#d98cff' },
  // ── tokens: earn, then spend ──
  { icon:'⛏', label:'Mine',             el: mineBoss.el, startHidden:true, group:'tokens', accent:'#e0a34d' },
  { iconSvg: PROMOTE_SVG, label:'Promote', el: promoBoss.el, startHidden:true, group:'tokens', accent:'#ffcc4d' },
  { icon:'ℹ️', label:'About & Legal',    el: infoBoss.el, startHidden:true, group:'info', bottom:true, accent:'#8a90a8' }
]);

// each panel wears its dock colour, so a glance says which panel you're in
dock.items.forEach(it => {
  if (it.el && it.accent) it.el.style.setProperty('--accent', it.accent);
});

/* desktop vs mobile based on screen width */
(function(){
  const mq = window.matchMedia('(max-width: 760px)');
  const apply = () => { document.body.classList.toggle('mobile', mq.matches); dock.setMode(mq.matches); };
  if (mq.addEventListener) mq.addEventListener('change', apply);
  else if (mq.addListener) mq.addListener(apply); // older Safari
  apply();
})();

// load any saved layout (positions / sizes / which panels are open), then track changes
dock.init();
