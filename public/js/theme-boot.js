/* riffrolled — theme-boot.js
   The colour theme engine. Loaded in <head> WITHOUT defer, so the saved
   theme is on the page before the first paint (no flash of Neon Noir).

   HOW THEMING WORKS
     Every colour in the stylesheets is a variable (css/themes.css lists
     them all; their defaults ARE Neon Noir). A theme is ~8 picks:

       bg     page background          a1  accent 1 (buttons, selection)
       panel  panel colour (optional)  a2  accent 2 (DJ AI, highlights)
       ink    text (optional: auto)    a3  accent 3 (links, sharing, info)
       glow   0 … 1.5                  a4  highlight (credits, warnings)
       font   'sans' | 'mono'

     derive() turns those into the full set of ~45 variables: surfaces,
     four shades of every accent, text, shadows, glow strength, the colour
     of text on a filled button. It also guards readability: text and
     accents are pushed lighter or darker until they pass a contrast check,
     so nobody can make the site unreadable for themselves.

   TWO SETS: P (the page) and D (the record player). The record player is
   always a dark object, even in Paper, so things printed on it use the D
   set (css/themes.css says where). In a dark theme D is the same as P.

   Only colours are ever applied, never CSS, through el.style.setProperty
   (CSSOM), which the strict style-src policy allows (see public/_headers).

   STORAGE (this browser only, like everything personal):
     localStorage rr.theme          the theme in use: a preset id or 'c:<id>'
     localStorage rr.themes.custom  your own themes [{id, name, picks}]
   themes.js mirrors both into Dexie settings so a backup carries them. */

var rrTheme = (function(){
  var LS_ACTIVE = 'rr.theme', LS_CUSTOM = 'rr.themes.custom';
  var DEFAULT = 'neon-noir';

  var FAMS = ['a1', 'a12', 'a2', 'a3', 'a4', 'ok', 'bad'];
  var LEVELS = ['', '-lt', '-tx', '-md', '-dk', '-dk2'];
  var SURF = ['sur0', 'sur1', 'sur2', 'sur3', 'sur4'];
  var SINGLE = ['ink', 'shade', 'shade-k', 'glow', 'tx-floor', 'on-acc'];
  var NAMES = (function(){
    var n = SURF.concat(SINGLE);
    FAMS.forEach(function(f){ LEVELS.forEach(function(l){ n.push(f + l); }); });
    return n;
  })();

  /* The presets. Neon Noir is the stylesheet's own defaults; its picks are
     here so "make my own" can start from it. */
  var PRESETS = [
    { id:'neon-noir',     name:'Neon Noir',     picks:{ bg:'#111111', panel:'#1a1a2e', ink:'#ffffff', a1:'#8a7bff', a2:'#ff9de2', a3:'#46e0ff', a4:'#ffcc4d', glow:1 } },
    { id:'void',          name:'Void',          picks:{ bg:'#030303', panel:'#0d0d0e', ink:'#e6e6e6', a1:'#9c9ca6', a2:'#cfcfd4', a3:'#8a96a0', a4:'#bdb39d', glow:0.12, ok:'#8fb39f', bad:'#c48686' } },
    { id:'amber-drive',   name:'Amber Drive',   picks:{ bg:'#110b07', panel:'#1d140e', ink:'#f7e9d7', a1:'#ffa53d', a2:'#ff7f50', a3:'#e8c48c', a4:'#ffd54f', glow:0.75, ok:'#a8c070' } },
    { id:'ice-circuit',   name:'Ice Circuit',   picks:{ bg:'#060a11', panel:'#0d1520', ink:'#f1f8ff', a1:'#4aa3ff', a2:'#a8ecff', a3:'#22e4ff', a4:'#e8f6ff', glow:1, bad:'#ff6f86' } },
    { id:'blood-moon',    name:'Blood Moon',    picks:{ bg:'#0d0506', panel:'#1a0b0e', ink:'#f4e3e5', a1:'#d3223f', a2:'#ff5263', a3:'#9d6cb4', a4:'#e3a05c', glow:0.85, bad:'#ff8a7a' } },
    { id:'gunmetal',      name:'Gunmetal',      picks:{ bg:'#0c0e11', panel:'#171a1f', ink:'#e9edf2', a1:'#a7b2c0', a2:'#dde2e9', a3:'#6aa7de', a4:'#c9d4e0', glow:0.35 } },
    { id:'soft-terminal', name:'Soft Terminal', picks:{ bg:'#07100d', panel:'#0e1b17', ink:'#cfe9dc', a1:'#5fd3a6', a2:'#93e2bc', a3:'#4dbab3', a4:'#d9c97b', glow:0.6, font:'mono' } },
    { id:'toxic',         name:'Toxic',         picks:{ bg:'#090b05', panel:'#12160a', ink:'#eff6dc', a1:'#a6ff00', a2:'#d7ff3c', a3:'#3dff8b', a4:'#ffe100', glow:1.15 } },
    { id:'paper',         name:'Paper',         picks:{ bg:'#f3efe6', panel:'#fcfaf5', ink:'#24212b', a1:'#566072', a2:'#a05a6c', a3:'#3c7380', a4:'#9a6c1a', glow:0.4, ok:'#3d8a5f', bad:'#b4473f' } }
  ];

  /* ── colour maths (sRGB, WCAG contrast) ── */
  function hex(h){
    h = String(h || '').replace('#', '').trim();
    if (h.length === 3) h = h.replace(/./g, function(c){ return c + c; });
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  function toHex(c){ return '#' + c.map(function(v){ v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function mix(a, b, t){ return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t, a[2] + (b[2]-a[2])*t]; }
  function lum(c){
    var v = c.map(function(x){ x /= 255; return x <= 0.03928 ? x/12.92 : Math.pow((x+0.055)/1.055, 2.4); });
    return 0.2126*v[0] + 0.7152*v[1] + 0.0722*v[2];
  }
  function contrast(a, b){ var x = lum(a), y = lum(b); return (Math.max(x,y) + 0.05) / (Math.min(x,y) + 0.05); }
  var WHITE = [255,255,255], BLACK = [0,0,0];
  /** move c toward `to` in small steps until it reaches `min` contrast with bg */
  function push(c, bg, min, to){
    var t = 0, out = c;
    while (contrast(out, bg) < min && t < 1){ t += 0.04; out = mix(c, to, t); }
    return out;
  }
  function trip(c){ return c.map(function(v){ return Math.round(v); }).join(','); }

  /** picks → { P:{name:value}, D:{…}, light, notes:[…], meta } */
  function derive(picks){
    var notes = [];
    var bg = hex(picks.bg) || [17,17,17];
    var light = lum(bg) > 0.3;
    var a1 = hex(picks.a1) || [138,123,255], a2 = hex(picks.a2) || [255,157,226],
        a3 = hex(picks.a3) || [70,224,255],  a4 = hex(picks.a4) || [255,204,77];
    var glow = isFinite(+picks.glow) ? Math.max(0, Math.min(1.5, +picks.glow)) : 1;

    function set(bgc, panelPick, inkPick, isLight, quiet){
      var T = {};
      var panel = panelPick || (isLight ? mix(bgc, WHITE, 0.6) : mix(mix(bgc, a1, 0.07), WHITE, 0.035));
      var ink = inkPick || (isLight ? mix([27,25,34], a1, 0.06) : mix([244,242,250], a1, 0.03));
      var to = isLight ? BLACK : WHITE;
      var ink2 = push(push(ink, panel, 7, to), bgc, 7, to);
      if (!quiet && inkPick && toHex(ink2) !== toHex(inkPick)) notes.push('Text colour adjusted so it stays readable.');
      ink = ink2;
      T.sur0 = isLight ? mix(bgc, ink, 0.09) : mix(mix(bgc, BLACK, 0.4), a1, 0.03);
      T.sur1 = bgc;
      T.sur2 = mix(bgc, panel, 0.45);
      T.sur3 = panel;
      T.sur4 = isLight ? mix(panel, ink, 0.05) : mix(panel, mix(ink, a1, 0.5), 0.06);
      T.ink = ink;
      T.shade = isLight ? mix(ink, BLACK, 0.5) : BLACK;
      T['shade-k'] = isLight ? 0.3 : 1;
      T.glow = isLight ? glow * 0.5 : glow;
      // the faintest text (hints, counts) still reaches 3:1 on a panel
      var f = 0;
      while (f < 1 && contrast(mix(panel, ink, f), panel) < 3.6) f += 0.02;
      T['tx-floor'] = Math.round(f * 100) / 100;

      var bases = { a1:a1, a12:mix(a1, a2, 0.5), a2:a2, a3:a3, a4:a4,
                    ok: hex(picks.ok) || (isLight ? [61,138,95] : [90,184,138]),
                    bad: hex(picks.bad) || (isLight ? [180,71,63] : [212,96,96]) };
      FAMS.forEach(function(fm){
        var c = bases[fm];
        var b = isLight ? push(c, panel, 4.5, BLACK) : push(c, panel, 3.2, WHITE);
        if (!quiet && /^a[1-4]$/.test(fm) && contrast(b, c) > 1.25) notes.push('Accent ' + fm.slice(1) + ' adjusted so it stays readable.');
        T[fm] = b;
        T[fm + '-lt'] = isLight ? mix(b, ink, 0.18) : mix(b, WHITE, 0.15);
        T[fm + '-tx'] = isLight ? push(mix(b, ink, 0.4), panel, 6.5, BLACK) : push(mix(b, WHITE, 0.42), panel, 7, WHITE);
        T[fm + '-md'] = isLight ? mix(b, ink, 0.1) : mix(b, bgc, 0.16);
        T[fm + '-dk'] = isLight ? mix(b, bgc, 0.72) : mix(b, bgc, 0.5);
        T[fm + '-dk2'] = isLight ? mix(b, bgc, 0.88) : mix(b, bgc, 0.78);
      });
      // text on a filled accent button: white or near-black, whichever reads better
      var dark = [16,16,20];
      var wMin = Math.min(contrast(WHITE, T.a1), contrast(WHITE, T.a2));
      var dMin = Math.min(contrast(dark, T.a1), contrast(dark, T.a2));
      T['on-acc'] = wMin >= 3 || wMin >= dMin ? WHITE : dark;
      return T;
    }

    var P = set(bg, hex(picks.panel), hex(picks.ink), light, false);
    // the record player is always dark: in a light theme it gets a dark companion set
    var D = light ? set([20,20,28], [28,28,40], null, false, true) : P;
    return { P:P, D:D, light:light, notes:notes, font: picks.font === 'mono' ? 'mono' : 'sans',
             themeColor: toHex(P.sur1) };
  }

  function val(v){ return Array.isArray(v) ? trip(v) : String(v); }

  /* ── storage ── */
  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lsSet(k, v){ try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch(e){} }
  function customs(){
    try { var a = JSON.parse(lsGet(LS_CUSTOM) || '[]'); return Array.isArray(a) ? a.filter(function(t){ return t && t.id && t.picks; }) : []; }
    catch(e){ return []; }
  }
  function saveCustoms(list){ lsSet(LS_CUSTOM, JSON.stringify(list)); }

  /** any theme by id: a preset id, or 'c:<id>' for one of yours */
  function find(id){
    if (!id) return null;
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    if (id.indexOf('c:') === 0){
      var c = customs();
      for (var j = 0; j < c.length; j++) if ('c:' + c[j].id === id) return { id:id, name:c[j].name, picks:c[j].picks, custom:true };
    }
    return null;
  }

  /* ── applying ── */
  var root = document.documentElement;
  var applied = [];
  var current = DEFAULT;

  function clear(){
    applied.forEach(function(n){ root.style.removeProperty(n); });
    applied = [];
    root.style.removeProperty('color-scheme');
  }
  function setVar(n, v){ root.style.setProperty(n, v); applied.push(n); }

  /** put a theme on the page. picks === null → Neon Noir, the stylesheet defaults. */
  function applyPicks(picks, id){
    clear();
    root.setAttribute('data-theme', id || 'custom');
    var meta = document.querySelectorAll('meta[name="theme-color"]');
    if (!picks){
      root.removeAttribute('data-font');
      root.removeAttribute('data-light');
      for (var m = 0; m < meta.length; m++) meta[m].setAttribute('content', '#0b0b17');
      return null;
    }
    var d = derive(picks);
    NAMES.forEach(function(n){
      setVar('--P-' + n, val(d.P[n]));
      setVar('--D-' + n, val(d.D[n]));
    });
    root.style.setProperty('color-scheme', d.light ? 'light' : 'dark');
    if (d.font === 'mono') root.setAttribute('data-font', 'mono'); else root.removeAttribute('data-font');
    if (d.light) root.setAttribute('data-light', ''); else root.removeAttribute('data-light');
    for (var k = 0; k < meta.length; k++) meta[k].setAttribute('content', d.themeColor);
    return d;
  }

  /** fade colours across for a moment (only while switching, so it never slows anything else) */
  var fadeT = null;
  function fade(){
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.classList.add('theme-fade');
    clearTimeout(fadeT);
    fadeT = setTimeout(function(){ root.classList.remove('theme-fade'); }, 500);
  }

  function use(id, opts){
    opts = opts || {};
    var t = find(id) || find(DEFAULT);
    if (opts.animate) fade();
    applyPicks(t.id === DEFAULT ? null : t.picks, t.id);
    current = t.id;
    if (opts.persist !== false) lsSet(LS_ACTIVE, t.id === DEFAULT ? null : t.id);
    try { window.dispatchEvent(new CustomEvent('rr:theme', { detail:{ id:t.id } })); } catch(e){}
    return t;
  }

  /** preview picks without saving (the editor) */
  function preview(picks){ return applyPicks(picks, 'preview'); }

  /* ── sharing: a theme is a short code that fits in a link ──
     v1~<name>~bg~panel~ink~a1~a2~a3~a4~glow×100~font    (hex without '#', '-' = auto) */
  function encode(name, p){
    var h = function(x){ var c = hex(x); return c ? toHex(c).slice(1) : '-'; };
    return ['v1', encodeURIComponent(String(name || 'Theme').slice(0, 40)).replace(/'/g, '%27').replace(/~/g, '%7E'), h(p.bg), h(p.panel), h(p.ink), h(p.a1), h(p.a2), h(p.a3), h(p.a4),
            Math.round((isFinite(+p.glow) ? +p.glow : 1) * 100), p.font === 'mono' ? 'm' : 's'].join('~');
  }
  function decode(code){
    var s = String(code || '').trim();
    var at = s.indexOf('theme=');
    if (at >= 0) s = s.slice(at + 6);
    // separators may arrive encoded (%7E) if an app re-encoded the link
    if (s.indexOf('~') < 0 && /%7e/i.test(s)) s = s.replace(/%7e/gi, '~');
    var f = s.split('~');
    if (f[0] !== 'v1' || f.length < 11) return null;
    var c = function(x){ return /^[0-9a-f]{6}$/i.test(x) ? '#' + x.toLowerCase() : null; };
    var p = { bg:c(f[2]), a1:c(f[5]), a2:c(f[6]), a3:c(f[7]), a4:c(f[8]) };
    if (!p.bg || !p.a1 || !p.a2 || !p.a3 || !p.a4) return null;
    if (c(f[3])) p.panel = c(f[3]);
    if (c(f[4])) p.ink = c(f[4]);
    var g = parseInt(f[9], 10); p.glow = isFinite(g) ? Math.max(0, Math.min(150, g)) / 100 : 1;
    if (f[10] === 'm') p.font = 'mono';
    var name = f[1];
    for (var dn = 0; dn < 2 && /%[0-9a-f]{2}/i.test(name); dn++){ try { name = decodeURIComponent(name); } catch(e){ break; } }
    name = name.replace(/[<>]/g, '').slice(0, 40) || 'Shared theme';
    return { name:name, picks:p };
  }

  // boot: the saved theme, before anything paints
  (function(){
    var saved = lsGet(LS_ACTIVE);
    if (saved && find(saved)) use(saved, { persist:false });
    else root.setAttribute('data-theme', DEFAULT);
  })();

  return {
    DEFAULT:DEFAULT, PRESETS:PRESETS, NAMES:NAMES,
    derive:derive, use:use, preview:preview, find:find,
    customs:customs, saveCustoms:saveCustoms,
    current:function(){ return current; },
    encode:encode, decode:decode,
    contrast:function(a, b){ return contrast(hex(a), hex(b)); },
    toHex:toHex, hex:hex, mix:mix, fade:fade,
    LS_ACTIVE:LS_ACTIVE, LS_CUSTOM:LS_CUSTOM, lsGet:lsGet, lsSet:lsSet
  };
})();
