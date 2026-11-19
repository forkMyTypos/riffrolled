/* riffrolled — themes.js
   The 🎨 Themes panel: pick a colour theme, or make your own.
   The engine (derive, apply, storage, share codes) is js/theme-boot.js,
   which runs in <head> so the page never flashes the wrong colours.

     PICK      a card per preset and per theme you made; click to use it
     MAKE      Make your own → the editor: name, background, text (auto),
               three accents, a highlight, glow, font. Every change shows
               on the whole site at once; Cancel puts the old theme back.
               Unreadable choices are nudged until they read (and it says so).
     SHARE     a theme you made → a link riffrolled.com/#theme=v1~… that
               opens with "Use this theme?". Nothing goes to the server.
     PASTE     a link or code from someone else → saved as one of yours.

   Markup uses classes only (no style=""): the swatch colours are set with
   el.style.setProperty, which the CSP allows. */

var themesBoss = {
  el: null,
  editing: null,      // { id|null, name, picks } while the editor is open
  before: null,       // the theme in use when the editor opened (Cancel goes back to it)

  FIELDS: [
    { k:'bg', label:'Background' },
    { k:'ink', label:'Text', auto:true },
    { k:'a1', label:'Accent 1', hint:'buttons, selection' },
    { k:'a2', label:'Accent 2', hint:'DJ AI, highlights' },
    { k:'a3', label:'Accent 3', hint:'links, sharing' },
    { k:'a4', label:'Highlight', hint:'credits, warnings' }
  ],

  setup(){
    var main =
      "<div class='th-body scrollable' data-testid='themes-body'>" +
        "<div class='th-pick'>" +
          "<div class='sec-head'>Themes</div>" +
          "<div class='th-grid th-presets' data-testid='themes-presets'></div>" +
          "<div class='th-mine-wrap' hidden>" +
            "<div class='sec-head'>Your themes</div>" +
            "<div class='th-grid th-mine' data-testid='themes-mine'></div>" +
          "</div>" +
          "<button type='button' class='th-make' data-testid='theme-make'>＋ Make your own</button>" +
          "<div class='th-paste'>" +
            "<input type='text' class='th-code' placeholder='Paste a theme link or code' aria-label='Theme link or code' data-testid='theme-code' autocomplete='off' spellcheck='false'>" +
            "<button type='button' class='th-code-use' data-testid='theme-code-use'>Use</button>" +
          "</div>" +
          "<p class='th-foot'>Saved in this browser. The record player keeps its own finish (on a computer, the arrows beside it change that).</p>" +
        "</div>" +
        "<div class='th-edit' hidden data-testid='theme-editor'></div>" +
      "</div>";
    this.el = menuB.createMenu('🎨 Themes', main);
    menuB.place(this.el, { left:'16px', top:'16px', width:'330px', height:'520px' });
    var self = this;
    this.el.querySelector('.th-make').onclick = function(){ self.openEditor(null); };
    var code = this.el.querySelector('.th-code');
    this.el.querySelector('.th-code-use').onclick = function(){ self.usePasted(code.value); };
    code.addEventListener('keydown', function(e){ if (e.key === 'Enter') self.usePasted(code.value); });
    this.render();
    window.addEventListener('rr:theme', function(){ if (!self.editing) self.render(); });
    this.fromLink();
  },

  /* ── the cards ── */
  card(t, mine){
    var cur = rrTheme.current();
    var b = document.createElement('div');
    b.className = 'th-card' + (cur === t.id ? ' on' : '');
    b.setAttribute('data-theme-id', t.id);
    b.setAttribute('data-testid', 'theme-card');
    var pick = document.createElement('button');
    pick.type = 'button'; pick.className = 'th-pickbtn';
    pick.setAttribute('aria-pressed', cur === t.id ? 'true' : 'false');
    pick.title = 'Use ' + t.name;
    pick.innerHTML = "<span class='th-sw' aria-hidden='true'><span class='th-sw-panel'><i class='d1'></i><i class='d2'></i><i class='d3'></i><b></b></span></span>" +
                     "<span class='th-name'></span><span class='th-tick' aria-hidden='true'>✓</span>";
    pick.querySelector('.th-name').textContent = t.name;
    var d = rrTheme.derive(t.picks), sw = pick.querySelector('.th-sw');
    var rgb = function(c){ return 'rgb(' + c.map(Math.round).join(',') + ')'; };
    sw.style.setProperty('--sw-bg', rgb(d.P.sur1));
    sw.style.setProperty('--sw-panel', rgb(d.P.sur3));
    sw.style.setProperty('--sw-ink', rgb(d.P.ink));
    sw.style.setProperty('--sw-1', rgb(d.P.a1));
    sw.style.setProperty('--sw-2', rgb(d.P.a2));
    sw.style.setProperty('--sw-3', rgb(d.P.a3));
    sw.style.setProperty('--sw-glow', String(d.P.glow));
    var self = this;
    pick.onclick = function(){ rrTheme.use(t.id, { animate:true }); self.render(); };
    b.appendChild(pick);
    if (mine){
      var acts = document.createElement('div');
      acts.className = 'th-acts';
      [['✎', 'Edit', 'edit'], ['⤴', 'Share', 'share'], ['✕', 'Delete', 'del']].forEach(function(a){
        var x = document.createElement('button');
        x.type = 'button'; x.className = 'th-act th-' + a[2]; x.textContent = a[0];
        x.title = a[1] + ' ' + t.name; x.setAttribute('aria-label', x.title);
        x.setAttribute('data-testid', 'theme-' + a[2]);
        x.onclick = function(){ self[a[2] === 'del' ? 'remove' : a[2]](t); };
        acts.appendChild(x);
      });
      b.appendChild(acts);
    }
    return b;
  },

  render(){
    if (!this.el) return;
    var pre = this.el.querySelector('.th-presets'), mine = this.el.querySelector('.th-mine');
    pre.innerHTML = ''; mine.innerHTML = '';
    var self = this;
    rrTheme.PRESETS.forEach(function(t){ pre.appendChild(self.card(t, false)); });
    var c = rrTheme.customs();
    c.forEach(function(t){ mine.appendChild(self.card({ id:'c:' + t.id, name:t.name, picks:t.picks }, true)); });
    this.el.querySelector('.th-mine-wrap').hidden = !c.length;
  },

  /* ── the editor ── */
  openEditor(t){
    var cur = rrTheme.find(rrTheme.current()) || rrTheme.PRESETS[0];
    this.before = rrTheme.current();
    var base = t || cur;
    var picks = JSON.parse(JSON.stringify(base.picks));
    var d = rrTheme.derive(picks);
    // the editor always shows real colours, never "auto": fill text in from the derived set
    this.editing = { id: t ? t.id : null, name: t ? t.name : this.freeName(cur.name), picks: picks,
                     autoInk: t ? !picks.ink : false };
    if (!picks.ink) picks.ink = rrTheme.toHex(d.P.ink);
    delete picks.panel;   // panels follow the background (and accent 1) in your own themes
    var self = this, e = this.editing;
    var box = this.el.querySelector('.th-edit');
    var rows = this.FIELDS.map(function(f){
      return "<label class='th-row'><span class='th-lbl'>" + f.label + (f.hint ? "<small>" + f.hint + "</small>" : "") + "</span>" +
        "<input type='color' class='th-col' data-k='" + f.k + "' data-testid='theme-col-" + f.k + "' aria-label='" + f.label + "'>" +
        (f.auto ? "<span class='th-auto'><input type='checkbox' class='th-auto-cb' data-testid='theme-ink-auto'> auto</span>" : "<span class='th-hex' data-k='" + f.k + "'></span>") +
      "</label>";
    }).join('');
    box.innerHTML =
      "<div class='sec-head'>" + (t ? 'Edit theme' : 'Make your own') + "</div>" +
      "<label class='th-row th-namerow'><span class='th-lbl'>Name</span><input type='text' class='th-namein' maxlength='40' data-testid='theme-name'></label>" +
      rows +
      "<label class='th-row'><span class='th-lbl'>Glow<small>flat … full neon</small></span><input type='range' class='th-glow' min='0' max='150' step='5' data-testid='theme-glow' aria-label='Glow'><span class='th-hex th-glow-v'></span></label>" +
      "<div class='th-row'><span class='th-lbl'>Font</span><span class='th-fonts'>" +
        "<label><input type='radio' name='thFont' value='sans'> Normal</label>" +
        "<label class='th-mono'><input type='radio' name='thFont' value='mono'> Mono</label></span></div>" +
      "<div class='th-note' role='status' data-testid='theme-note'></div>" +
      "<div class='th-btns'><button type='button' class='th-save' data-testid='theme-save'>Save</button>" +
      "<button type='button' class='th-cancel' data-testid='theme-cancel'>Cancel</button></div>";
    var nameIn = box.querySelector('.th-namein');
    nameIn.value = e.name;
    nameIn.oninput = function(){ e.name = nameIn.value; };
    box.querySelectorAll('.th-col').forEach(function(inp){
      var k = inp.getAttribute('data-k');
      inp.value = rrTheme.toHex(rrTheme.hex(picks[k]) || [128,128,128]);
      inp.oninput = function(){
        picks[k] = inp.value;
        if (k === 'ink'){ e.autoInk = false; box.querySelector('.th-auto-cb').checked = false; }
        self.live();
      };
    });
    var auto = box.querySelector('.th-auto-cb');
    auto.checked = e.autoInk;
    auto.onchange = function(){ e.autoInk = auto.checked; self.live(); };
    var glow = box.querySelector('.th-glow');
    glow.value = Math.round((isFinite(+picks.glow) ? +picks.glow : 1) * 100);
    glow.oninput = function(){ picks.glow = +glow.value / 100; self.live(); };
    box.querySelectorAll('input[name=thFont]').forEach(function(r){
      r.checked = (picks.font === 'mono') === (r.value === 'mono');
      r.onchange = function(){ if (r.checked){ if (r.value === 'mono') picks.font = 'mono'; else delete picks.font; self.live(); } };
    });
    box.querySelector('.th-save').onclick = function(){ self.save(); };
    box.querySelector('.th-cancel').onclick = function(){ self.closeEditor(true); };
    this.el.querySelector('.th-pick').hidden = true;
    box.hidden = false;
    this.el.querySelector('.th-body').scrollTop = 0;
    this.live();
  },

  /** the picks as they will be saved (auto text = no ink) */
  finalPicks(){
    var p = JSON.parse(JSON.stringify(this.editing.picks));
    if (this.editing.autoInk) delete p.ink;
    return p;
  },

  /** show the editor's picks on the whole site, and say what the guard changed */
  live(){
    var e = this.editing; if (!e) return;
    var box = this.el.querySelector('.th-edit');
    var d = rrTheme.preview(this.finalPicks());
    if (e.autoInk) box.querySelector('.th-col[data-k=ink]').value = rrTheme.toHex(d.P.ink);
    box.querySelectorAll('.th-hex[data-k]').forEach(function(h){ h.textContent = e.picks[h.getAttribute('data-k')].toUpperCase(); });
    box.querySelector('.th-glow-v').textContent = Math.round((+e.picks.glow || 0) * 100) + '%';
    var note = box.querySelector('.th-note');
    note.textContent = d.notes.length ? '◐ ' + d.notes.join(' ') : '';
    note.classList.toggle('on', !!d.notes.length);
  },

  closeEditor(restore){
    if (restore && this.before) rrTheme.use(this.before, { persist:false });
    this.editing = null;
    this.el.querySelector('.th-edit').hidden = true;
    this.el.querySelector('.th-edit').innerHTML = '';
    this.el.querySelector('.th-pick').hidden = false;
    this.render();
  },

  save(){
    var e = this.editing; if (!e) return;
    var name = (e.name || '').replace(/[<>]/g, '').trim().slice(0, 40) || this.freeName('My theme');
    var list = rrTheme.customs(), picks = this.finalPicks();
    var id = e.id ? e.id.replace(/^c:/, '') : Date.now().toString(36);
    var at = -1;
    list.forEach(function(t, i){ if (t.id === id) at = i; });
    var row = { id:id, name:name, picks:picks };
    if (at >= 0) list[at] = row; else list.push(row);
    rrTheme.saveCustoms(list);
    this.editing = null;
    rrTheme.use('c:' + id);
    this.closeEditor(false);
    if (window.appToast) appToast('Theme saved: ' + name, 'ok');
  },

  /** "Neon Noir 2", "My theme 3" … a name not already taken */
  freeName(base){
    base = String(base || 'My theme').replace(/\s+\d+$/, '');
    var names = rrTheme.customs().map(function(t){ return t.name; });
    for (var n = 2; n < 99; n++){ var s = base + ' ' + n; if (names.indexOf(s) < 0) return s; }
    return base;
  },

  edit(t){ this.openEditor(t); },

  remove(t){
    var list = rrTheme.customs().filter(function(x){ return 'c:' + x.id !== t.id; });
    rrTheme.saveCustoms(list);
    var self = this;
    if (rrTheme.current() === t.id) rrTheme.use(rrTheme.DEFAULT, { animate:true });
    this.render();
    // an undo, not an "are you sure?"
    if (window.appNotify) appNotify('Deleted ' + t.name + '.', '', { label:'Undo', run:function(){
      var l = rrTheme.customs(); l.push({ id:t.id.replace(/^c:/, ''), name:t.name, picks:t.picks });
      rrTheme.saveCustoms(l); self.render();
    }});
  },

  link(t){ return location.origin + '/#theme=' + rrTheme.encode(t.name, t.picks); },

  share(t){
    var url = this.link(t);
    var done = function(){ if (window.appToast) appToast('Theme link copied: send it to anyone', 'ok'); };
    var self = this;
    try { navigator.clipboard.writeText(url).then(done, function(){ self.showCode(url); }); }
    catch(e){ this.showCode(url); }
  },
  /** no clipboard: put the link in the paste box, selected, to copy by hand */
  showCode(url){
    var c = this.el.querySelector('.th-code'); c.value = url; c.focus(); c.select();
    if (window.appToast) appToast('Copy the theme link from the box');
  },

  /** save someone's theme as one of yours (once) and use it */
  adopt(shared){
    var list = rrTheme.customs(), code = rrTheme.encode('', shared.picks), hit = null;
    list.forEach(function(t){ if (rrTheme.encode('', t.picks) === code) hit = t; });
    if (!hit){
      hit = { id: Date.now().toString(36), name: shared.name, picks: shared.picks };
      list.push(hit); rrTheme.saveCustoms(list);
    }
    rrTheme.use('c:' + hit.id, { animate:true });
    this.render();
    return hit;
  },

  usePasted(text){
    var s = rrTheme.decode(text);
    if (!s){ if (window.appToast) appToast("That isn't a riffrolled theme code", 'err'); return; }
    var t = this.adopt(s);
    this.el.querySelector('.th-code').value = '';
    if (window.appToast) appToast('Theme added: ' + t.name, 'ok');
  },

  /** riffrolled.com/#theme=… : try it on, then keep it or go back */
  fromLink(){
    var h = location.hash || '';
    if (h.indexOf('theme=') < 0) return;
    var s = rrTheme.decode(h);
    try { history.replaceState(null, '', location.pathname + location.search); } catch(e){}
    if (!s) return;
    var was = rrTheme.current(), self = this;
    rrTheme.fade(); rrTheme.preview(s.picks);
    if (window.appNotify) appNotify('Someone sent you a theme: ' + s.name + '. Keep it?', '', { label:'Keep it', run:function(){ self.adopt(s); } });
    // closing the banner without keeping it puts your own theme back
    var b = document.getElementById('appBanner'), x = b && b.querySelector('.x');
    if (x) x.addEventListener('click', function(){ rrTheme.use(was, { persist:false, animate:true }); });
  }
};
themesBoss.setup();
