/* riffrolled — panels-music.js
   Finding and adding music: Search (local), Import (channel /
   playlist / paste), Database (shared catalogue), Random Mix. */

/* ── SEARCH TRACKS PANEL (search the whole library) ── */
/* ── SEARCH — one box across your library. Scope: Tracks / Playlists / Both.
   The limits row caps how many result rows get built (DOM stays small as
   the library grows); "All" is available but capped at 500 for safety.

   "Search does nothing" had three causes, all fixed here:
     · it only matched track TITLES, so typing an artist found nothing.
       Every word now has to appear somewhere in the title, artist, genre
       or tags, in any order.
     · with an empty (or small) library it said "No matches" and stopped.
       Below your own results it now looks in riffrolled's shared
       catalogue (free: no YouTube quota), and offers to search YouTube
       itself as a separate, explicit step.
     · clicking a playlist only switched to it, silently. It now opens the
       Playlist window on it. ── */
var searchBoss = {
  scope: 'both',
  limit: 20,

  setup(){
    var main =
      "<div class='sec searchC'>" +
        "<div class='row srh-top'>" +
          "<div class='srh-scopes'>" +
            "<button class='srh-scope' data-s='tracks' title='Search tracks'>🎵</button>" +
            "<button class='srh-scope' data-s='playlists' title='Search playlists'>📃</button>" +
            "<button class='srh-scope active' data-s='both' title='Search both'>∞</button>" +
          "</div>" +
          "<input type='text' class='st-search' placeholder='Search your library…'>" +
        "</div>" +
        "<div class='st-results scrollable'><div class='st-local'></div><div class='st-remote' data-testid='st-remote'></div></div>" +
        "<div class='srh-limits'>" +
          "<span class='srh-limits-label'>Show</span>" +
          "<button class='srh-limit' data-n='10'>10</button>" +
          "<button class='srh-limit active' data-n='20'>20</button>" +
          "<button class='srh-limit' data-n='50'>50</button>" +
          "<button class='srh-limit' data-n='500'>All</button>" +
        "</div>" +
        "<div class='status-bar st-status'></div>" +
      "</div>";
    this.el = menuB.createMenu('🔎 Search', main);
    menuB.place(this.el, { right:'470px', top:'120px', width:'320px', height:'360px' });

    var self = this;
    var input = this.el.querySelector('.st-search');
    input.addEventListener('input', function(){ clearTimeout(self._t); self._t = setTimeout(function(){ self.render(); }, 140); });
    input.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ clearTimeout(self._t); self.render(); } });

    // scope + limit toggles (delegated)
    this.el.querySelector('.srh-scopes').addEventListener('click', function(e){
      var b = e.target.closest('.srh-scope'); if (!b) return;
      self.scope = b.dataset.s;
      self.el.querySelectorAll('.srh-scope').forEach(function(x){ x.classList.toggle('active', x === b); });
      self.render();
    });
    this.el.querySelector('.srh-limits').addEventListener('click', function(e){
      var b = e.target.closest('.srh-limit'); if (!b) return;
      self.limit = Number(b.dataset.n) || 20;
      self.el.querySelectorAll('.srh-limit').forEach(function(x){ x.classList.toggle('active', x === b); });
      self.render();
    });

    // one delegated handler for all result rows
    this.el.querySelector('.st-results').addEventListener('click', async function(e){
      var plRow = e.target.closest('.srh-pl');
      if (plRow){
        await plBoss.setActivePlaylist(Number(plRow.dataset.id));
        if (window.dock) dock.openPanel(plBoss.currentEl);
        self.status('Opened “' + plRow.dataset.name + '”', 'ok'); self.render(); return;
      }
      if (e.target.closest('.st-yt')){ self.remote(true); return; }
      var item = e.target.closest('.st-item'); if (!item) return;
      if (item.classList.contains('st-cat')) return self.onCatalogue(e, item);
      if (e.target.closest('.st-play')){ ytPlay(item.dataset.yt, item.dataset.name); return; }
      if (e.target.closest('.st-add')){
        if (!window.plBoss || !plBoss.activeId){ self.status('Select a playlist first', 'err'); return; }
        var r = await dbBoss.addToPlaylist(plBoss.activeId, Number(item.dataset.id));
        self.status(r === 'dupe' ? 'Already in current playlist' : 'Added ✓', r === 'dupe' ? null : 'ok');
        plBoss.afterDbChange();
      }
    });

    this.render();
  },

  status(msg, kind){
    var el = this.el.querySelector('.st-status');
    el.textContent = msg || '';
    el.className = 'status-bar st-status' + (kind ? ' ' + kind : '');
    var self = this;
    if (msg && kind === 'ok'){ clearTimeout(this._st); this._st = setTimeout(function(){ if (el.textContent === msg) self.status(''); }, 5000); }
  },

  /** every word of the query appears in the title, artist, genre or tags */
  matches(t, words){
    if (!words.length) return true;
    var hay = [t.name, t.artist, t.genre, Array.isArray(t.tags) ? t.tags.join(' ') : t.tags]
      .filter(Boolean).join(' ').toLowerCase();
    return words.every(function(w){ return hay.indexOf(w) >= 0; });
  },

  async render(){
    var results = this.el.querySelector('.st-local');
    var q = (this.el.querySelector('.st-search').value || '').trim().toLowerCase();
    var cap = this.limit, html = '', total = 0;


    // playlists section
    if (this.scope !== 'tracks'){
      var pls = await dbBoss.getPlaylists();
      var mp = q ? pls.filter(function(p){ return p.name.toLowerCase().includes(q); }) : pls;
      total += mp.length;
      var showP = mp.slice(0, cap);
      if (showP.length){
        var counts = {};
        await Promise.all(showP.map(async function(pl){ counts[pl.id] = await dbBoss.countTracks(pl.id); }));
        html += "<div class='srh-sec-head'>Playlists</div>" + showP.map(function(pl){
          return "<div class='row-item srh-pl" + (pl.id === plBoss.activeId ? " active" : "") + "' data-id='" + pl.id + "' data-name='" + escapeHtml(pl.name) + "'>"
            + "<span class='name'>" + escapeHtml(pl.name) + "</span>"
            + "<span class='pl-item-count'>" + counts[pl.id] + "</span></div>";
        }).join('');
      }
    }

    // tracks section
    if (this.scope !== 'playlists'){
      var all = await db.tracks.toArray();
      var words = q.split(/\s+/).filter(Boolean), self0 = this;
      var mt = q ? all.filter(function(t){ return t.playable !== 0 && self0.matches(t, words); }) : all;
      this._localYt = new Set(all.map(function(t){ return t.ytId; }));
      total += mt.length;
      var inList = new Set();
      if (plBoss.activeId){
        var joins = await db.playlistTracks.where('playlistId').equals(plBoss.activeId).toArray();
        joins.forEach(function(j){ inList.add(j.trackId); });
      }
      var showT = mt.slice(0, cap);
      if (showT.length){
        html += "<div class='srh-sec-head'>Tracks</div>" + showT.map(function(t){
          return "<div class='st-item' data-id='" + t.id + "' data-yt='" + escapeHtml(t.ytId) + "' data-name='" + escapeHtml(t.name) + "'>"
            + "<button class='icon-btn st-play' title='Play now'>▶</button>"
            + "<span class='name'>" + (t.artist ? "<span class='track-artist'>" + escapeHtml(t.artist) + "</span>" : '') + escapeHtml(t.name) + "</span>"
            + (inList.has(t.id) ? "<span class='st-inlist'>✓ in list</span>" : "<button class='icon-btn st-add' title='Add to current playlist'>＋</button>")
            + "</div>";
        }).join('');
      }
    }

    if (!html) html = "<div class='empty'>" + (q ? 'Nothing in your library matches “' + escapeHtml(q) + '”' : 'Your library is empty — type an artist or a song to look further') + "</div>";
    results.innerHTML = html;   // one DOM write, capped row count
    var shown = Math.min(total, cap * (this.scope === 'both' ? 2 : 1));
    this.status(total > shown ? ('Showing ' + shown + ' of ' + total) : '');
    this._q = q;
    this.remote(false);
  },

  /* ── beyond your library ──────────────────────────────────────────
     riffrolled's shared catalogue first: it costs nothing (source=db never
     touches YouTube). "Search YouTube" is a separate press because it can
     spend the site's YouTube quota; the server caches what it finds, so
     the next person searching the same thing gets it from the catalogue. */
  async remote(youtube){
    var box = this.el.querySelector('.st-remote');
    var q = this._q || '';
    var seq = this._rseq = (this._rseq || 0) + 1;
    if (this.scope === 'playlists' || q.length < 2){ box.innerHTML = ''; return; }
    box.innerHTML = "<div class='srh-sec-head'>" + (youtube ? 'Searching YouTube…' : 'In riffrolled’s catalogue') + "</div><div class='st-wait'>Looking…</div>";
    var rows = [];
    try {
      if (window.riffUsage) riffUsage.count(youtube ? 'search_youtube' : 'search_catalogue');
      var r = await fetch('/api/search?limit=12&q=' + encodeURIComponent(q) + (youtube ? '' : '&source=db'));
      if (seq !== this._rseq) return;                    // a newer search overtook this one
      if (!r.ok) throw new Error('HTTP ' + r.status);
      rows = await r.json();
      // the site's daily YouTube allowance is used up: the catalogue answered instead
      var capped = youtube && r.headers.get('X-Riff-Warning') === 'search_cap';
    } catch(e){
      if (seq !== this._rseq) return;
      box.innerHTML = "<div class='srh-sec-head'>Beyond your library</div><div class='st-wait'>Couldn’t reach riffrolled just now.</div>";
      return;
    }
    var mine = this._localYt || new Set();
    var self = this;
    var items = (Array.isArray(rows) ? rows : []).map(function(t){
      var m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(t.url || '');
      return m ? { ytId: m[1], name: t.name || m[1], artist: t.artist || '', genre: t.genre || '' } : null;
    }).filter(function(t){ return t && !mine.has(t.ytId); });
    this._cat = items;
    box.innerHTML = "<div class='srh-sec-head'>" + (youtube ? (capped ? 'In riffrolled’s catalogue' : 'From YouTube') : 'In riffrolled’s catalogue') + "</div>" +
      (capped ? "<div class='st-wait' data-testid='st-capped'>YouTube searching is resting for today (riffrolled shares a daily allowance). Try again tomorrow, or paste a YouTube link in Import.</div>" : '') +
      (items.length ? items.map(function(t, i){
        return "<div class='st-item st-cat' data-i='" + i + "' data-yt='" + escapeHtml(t.ytId) + "'>"
          + "<button class='icon-btn st-play' title='Play now'>▶</button>"
          + "<span class='name'>" + (t.artist ? "<span class='track-artist'>" + escapeHtml(t.artist) + "</span>" : '') + escapeHtml(t.name) + "</span>"
          + "<button class='icon-btn st-add' title='Add to the current playlist'>＋</button>"
          + "</div>";
      }).join('') : "<div class='st-wait'>" + (youtube ? 'YouTube found nothing new for that.' : 'Nothing more in the catalogue.') + "</div>") +
      (youtube ? '' : "<button class='st-yt' data-testid='st-yt'>Search YouTube for “" + escapeHtml(q) + "”</button>");
  },

  async onCatalogue(e, item){
    var t = (this._cat || [])[Number(item.dataset.i)];
    if (!t) return;
    var tid = await dbBoss.createTrack(t.ytId, t.name);
    try {
      var row = await dbBoss.getTrack(t.ytId), meta = {};
      if (row && !row.artist && t.artist) meta.artist = t.artist;
      if (row && !row.genre && t.genre) meta.genre = t.genre;
      if (Object.keys(meta).length) await dbBoss.updateTrackMeta(t.ytId, meta);
    } catch(err){}
    if (e.target.closest('.st-play')){ ytPlay(t.ytId, t.name); return; }
    if (e.target.closest('.st-add')){
      if (!window.plBoss || !plBoss.activeId){ this.status('Open or make a playlist first — it’s saved to your library meanwhile', 'err'); return; }
      var r = await dbBoss.addToPlaylist(plBoss.activeId, tid);
      this.status(r === 'dupe' ? 'Already in the current playlist' : 'Added ✓', r === 'dupe' ? null : 'ok');
      plBoss.afterDbChange();
    }
  }
};

/* ── IMPORT — bring music in bulk. Channel import runs through the
   riffrolled API (server key); pasted links/IDs are parsed locally. ── */
var YT_ICON_SVG = "<svg viewBox='0 0 24 24' aria-hidden='true'><rect x='1.5' y='4.5' width='21' height='15' rx='4.2' fill='#ff0033'/><path d='M9.8 8.6 L16 12 L9.8 15.4 Z' fill='#fff'/></svg>";

var importBoss = {
  setup(){
    var main =
      "<div class='sec importC youtube'>" +
        "<div class='sec-head'>Import a channel or playlist</div>" +
        "<div class='row'>" +
          "<input type='text' class='ch-input' placeholder='Channel URL, @handle, or playlist link…'>" +
          "<select class='ch-limit' title='How many to import'>" +
            "<option value='25'>25</option><option value='50' selected>50</option>" +
            "<option value='100'>100</option><option value='200'>200</option><option value='2000'>All</option>" +
          "</select>" +
          "<button class='icon-btn ch-go' title='Import channel'>↓</button>" +
        "</div>" +
        "<div class='status-bar ch-status'></div>" +
      "</div>" +
      "<div class='sec paste-sec'>" +
        "<div class='sec-head'>Paste video links or IDs</div>" +
        "<textarea class='paste-box' data-testid='paste-box' rows='4' placeholder='Paste YouTube links or video IDs — separated by commas, spaces, or new lines…'></textarea>" +
        "<div class='row paste-row'>" +
          "<span class='paste-count'></span>" +
          "<button class='icon-btn paste-go' data-testid='add-tracks-btn' aria-label='Add tracks' title='Add these videos'>＋ Add</button>" +
        "</div>" +
        "<div class='status-bar paste-status' data-testid='paste-status' role='status' aria-live='polite'></div>" +
      "</div>";
    this.el = menuB.createMenu('▶ Import', main);
    menuB.place(this.el, { right:'470px', top:'400px', width:'330px' });
    this.bind();
  },

  bind(){
    var root = this.el, self = this;

    /* ── channel import (server resolves + stores; we mirror locally) ── */
    var chStatusEl = root.querySelector('.ch-status'), chT;
    function chStatus(msg, kind){
      chStatusEl.textContent = msg || '';
      chStatusEl.className = 'status-bar ch-status' + (kind ? ' ' + kind : '');
      if (msg && kind === 'ok'){ clearTimeout(chT); chT = setTimeout(function(){ if(chStatusEl.textContent===msg) chStatus(''); }, 8000); }
    }
    var chInput = root.querySelector('.ch-input');
    var chGo    = root.querySelector('.ch-go');
    var chLimit = root.querySelector('.ch-limit');
    async function importChannel(){
      var input = chInput.value.trim();
      if (!input){ chStatus('Paste a channel URL, @handle, or ID', 'err'); return; }
      var limit = parseInt(chLimit ? chLimit.value : '50', 10) || 50;
      chGo.disabled = true;
      // a "list=" in the URL means a playlist; anything else is a channel
      var listM = /[?&]list=([A-Za-z0-9_-]{12,})/.exec(input);
      var isList = !!listM || /^(?:PL|LL|FL|OL|UU)[A-Za-z0-9_-]{10,}$/.test(input);
      chStatus(isList ? 'Importing playlist…' : 'Importing channel…');
      try {
        var r = await fetch(isList
          ? '/api/playlist?list=' + encodeURIComponent(listM ? listM[1] : input) + '&limit=' + limit
          : '/api/channel?input=' + encodeURIComponent(input) + '&limit=' + limit);
        if (!r.ok){
          var msg = 'HTTP ' + r.status;
          try { msg = (await r.json()).error || msg; } catch(e2){}
          throw new Error(msg);
        }
        var data = await r.json();
        var existing = await db.playlists.where('name').equals(data.channel).first();
        var plId = existing ? existing.id : await dbBoss.createPl(data.channel);
        var added = 0;
        for (var i = 0; i < (data.tracks || []).length; i++){
          var t = data.tracks[i];
          var m = /[?&]v=([A-Za-z0-9_-]{6,20})/.exec(t.url || '');
          if (!m) continue;
          var tid = await dbBoss.createTrack(m[1], t.name);
          if ((await dbBoss.addToPlaylist(plId, tid)) === 'added') added++;
        }
        plBoss.afterDbChange();
        chStatus('Added ' + added + ' videos to “' + data.channel + '”', 'ok');
        chInput.value = '';
      } catch(e){
        chStatus('Import failed: ' + e.message, 'err');
      } finally {
        chGo.disabled = false;
      }
    }
    chGo.onclick = importChannel;
    chInput.addEventListener('keydown', function(e){ if (e.key === 'Enter') importChannel(); });

    /* ── bulk paste ── */
    var box = root.querySelector('.paste-box');
    var go = root.querySelector('.paste-go');
    var countEl = root.querySelector('.paste-count');
    var pStatusEl = root.querySelector('.paste-status'), pT;
    /* The result stays put. It used to clear itself after 8 seconds,
       which is fine for a glance and useless for anything checking
       afterwards — a person who looked away and an agent polling the DOM
       both found an empty box and no way to tell "nothing happened" from
       "it worked a moment ago". It is replaced by the next action
       instead of expiring. */
    function pStatus(msg, kind){
      pStatusEl.textContent = msg || '';
      pStatusEl.className = 'status-bar paste-status' + (kind ? ' ' + kind : '');
      pStatusEl.setAttribute('data-state', kind || (msg ? 'busy' : 'idle'));
    }
    // accepts watch?v=, youtu.be/, shorts/, embed/ URLs and bare 11-char IDs;
    // split on commas, whitespace, or newlines; deduped
    function parseIds(text){
      var ids = [], seen = {};
      text.split(/[\s,]+/).forEach(function(tok){
        if (!tok) return;
        var m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(tok)
             || /youtu\.be\/([A-Za-z0-9_-]{11})/.exec(tok)
             || /\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})/.exec(tok)
             || /^([A-Za-z0-9_-]{11})$/.exec(tok);
        if (m && !seen[m[1]]){ seen[m[1]] = 1; ids.push(m[1]); }
      });
      return ids;
    }
    box.addEventListener('input', function(){
      var n = parseIds(box.value).length;
      countEl.textContent = n ? (n + ' video' + (n > 1 ? 's' : '') + ' found') : '';
    });
    go.onclick = async function(){
      var ids = parseIds(box.value);
      if (!ids.length){ pStatus('No video links or IDs found', 'err'); return; }
      go.disabled = true;
      pStatus('Adding ' + ids.length + '…');
      var added = 0;
      for (var i = 0; i < ids.length; i++){
        var id = ids[i], title = 'Video ' + id;
        // try oEmbed for the real title (no key needed); fall back to the id
        try {
          var r = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id) + '&format=json');
          if (r.ok){ var d = await r.json(); if (d.title) title = d.title; }
        } catch(e){ /* offline or CORS hiccup — id-as-title still works */ }
        var tid = await dbBoss.createTrack(id, title);
        /* Contribute to the shared catalogue too. The wallet rides along
           so that being the first to add a track that YouTube confirms
           earns a contribution point — see src/contrib.js. It identifies
           the contribution, not the listening: nothing about what you
           then play goes anywhere near it. */
        try {
          var cw = window.riffWallet ? await riffWallet.get() : '';
          fetch('/api/track', { method:'POST', headers:{ 'content-type':'application/json' },
            body: JSON.stringify({ name: title, url: 'https://www.youtube.com/watch?v=' + id,
                                   wallet: cw }) });
        } catch(e){ /* offline is fine — local library is the source of truth for you */ }
        if (window.plBoss && plBoss.activeId){
          if ((await dbBoss.addToPlaylist(plBoss.activeId, tid)) === 'added') added++;
        } else { added++; }
        pStatus('Adding… ' + (i + 1) + '/' + ids.length);
      }
      plBoss.afterDbChange();
      pStatus('Added ' + added + ' of ' + ids.length +
        (plBoss.activeId ? ' to the current playlist' : ' to your library'), 'ok');
      // readable without parsing the sentence above, which is written for
      // a person and will be reworded
      pStatusEl.setAttribute('data-added', String(added));
      pStatusEl.setAttribute('data-asked', String(ids.length));
      box.value = ''; countEl.textContent = '';
      go.disabled = false;
      try { window.dispatchEvent(new CustomEvent('riffrolled:changed',
        { detail: { action:'addTracks', added: added, asked: ids.length } })); } catch(e){}
    };
  }
};

/* ── DATABASE — search the shared riffrolled catalogue. Reads only from
   our D1 database (source=db): the YouTube API is never touched here. ── */
var DB_ICON_SVG =
  "<svg viewBox='0 0 24 24' aria-hidden='true'>" +
    "<defs><linearGradient id='dbg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#8a7bff'/><stop offset='1' stop-color='#46e0ff'/></linearGradient></defs>" +
    "<ellipse cx='12' cy='5' rx='8' ry='3' fill='none' stroke='url(#dbg)' stroke-width='1.8'/>" +
    "<path d='M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5' fill='none' stroke='url(#dbg)' stroke-width='1.8'/>" +
    "<path d='M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6' fill='none' stroke='url(#dbg)' stroke-width='1.8'/>" +
  "</svg>";

var dataBoss = {
  setup(){
    var main =
      "<div class='sec'>" +
        "<div class='sec-head'>Search the shared database</div>" +
        "<div class='row'>" +
          "<input type='text' class='dbs-input' placeholder='Search the catalogue…'>" +
        "</div>" +
        "<div class='row dbs-genre-row'>" +
          "<select class='dbs-genre' aria-label='Filter by genre' data-testid='db-genre'><option value=''>All genres</option></select>" +
        "</div>" +
        "<div class='dbs-results scrollable'></div>" +
        "<div class='status-bar dbs-status'></div>" +
      "</div>";
    this.el = menuB.createMenu(DB_ICON_SVG.replace(/dbg/g, 'dbgT') + " Database", main);
    this.el.classList.add('data-panel');
    menuB.place(this.el, { right:'470px', top:'400px', width:'320px', height:'340px' });

    var self = this;
    var input = this.el.querySelector('.dbs-input');
    input.addEventListener('input', function(){ clearTimeout(self._t); self._t = setTimeout(function(){ self.run(); }, 160); });

    /* The genre list is the closed one in src/genres.js. The copy that
       ships with the page is enough to draw the menu at once; the server's
       own list replaces it when it answers, so a genre added on the server
       shows up here without a new page. */
    var sel = this.el.querySelector('.dbs-genre');
    this.fillGenres(sel, (window.riffGenres && riffGenres.LIST) || []);
    fetch('/api/config').then(function(r){ return r.ok ? r.json() : null; }).then(function(c){
      if (c && Array.isArray(c.GENRES) && c.GENRES.length) self.fillGenres(sel, c.GENRES);
    }).catch(function(){});
    sel.addEventListener('change', function(){ self.run(); });

    this.el.querySelector('.dbs-results').addEventListener('click', async function(e){
      var item = e.target.closest('.st-remote'); if (!item) return;
      var vid = item.dataset.yt, name = item.dataset.name;
      item.classList.remove('row-flash'); void item.offsetWidth; item.classList.add('row-flash');
      if (e.target.closest('.st-play')){ self.status('▶ Playing ' + name); ytPlay(vid, name); return; }
      if (e.target.closest('.st-promote')){
        /* This used to POST /api/promote straight off, silently buying the
           minimum spend. A campaign now has a name, a budget and a choice
           of where it runs, and a button that invents all three on your
           behalf is a button that spends your credits for you. So it opens
           the Promote panel with the track already picked. */
        if (window.promoBoss && window.dock){
          dock.openPanel(promoBoss.el);
          promoBoss.select(vid, name, true);
          self.status('Set up the campaign in the Promote panel →', 'ok');
        } else {
          self.status('The Promote panel isn’t available', 'err');
        }
        return;
      }
      if (e.target.closest('.st-add')){
        self.status('Adding…');
        var tid = await dbBoss.createTrack(vid, name);
        if (window.plBoss && plBoss.activeId){
          var r = await dbBoss.addToPlaylist(plBoss.activeId, tid);
          self.status(r === 'dupe' ? 'Already in current playlist' : '✓ Added “' + name + '”', r === 'dupe' ? null : 'ok');
          plBoss.afterDbChange();
        } else {
          self.status('✓ Saved to library (no active playlist)', 'ok');
        }
      }
    });

    this.run();   // empty query: latest additions
  },

  fillGenres(sel, list){
    var keep = sel.value;
    sel.innerHTML = '';
    var all = document.createElement('option'); all.value = ''; all.textContent = 'All genres'; sel.appendChild(all);
    list.forEach(function(g){
      var o = document.createElement('option'); o.value = g; o.textContent = g; sel.appendChild(o);
    });
    sel.value = keep;
  },

  status(msg, kind){
    var el = this.el.querySelector('.dbs-status');
    el.textContent = msg || '';
    el.className = 'status-bar dbs-status' + (kind ? ' ' + kind : '');
    var self = this;
    if (msg && kind === 'ok'){ clearTimeout(this._st); this._st = setTimeout(function(){ if (el.textContent === msg) self.status(''); }, 5000); }
  },

  idFromUrl(u){
    var m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(u) || /youtu\.be\/([A-Za-z0-9_-]{11})/.exec(u);
    return m ? m[1] : null;
  },

  async run(){
    var results = this.el.querySelector('.dbs-results');
    var q = (this.el.querySelector('.dbs-input').value || '').trim();
    var self = this;
    try {
      var genre = this.el.querySelector('.dbs-genre').value;
      // a genre alone is a straight filter; with words as well, search
      // first and keep the rows of that genre (the search endpoint takes
      // one question at a time)
      var endpoint = q
        ? '/api/search?q=' + encodeURIComponent(q) + '&limit=50&source=db'
        : genre ? '/api/tracks?genre=' + encodeURIComponent(genre) + '&limit=50'
                : '/api/tracks?limit=30';
      var r = await fetch(endpoint);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var list = await r.json();
      if (genre && q) list = list.filter(function(t){ return t.genre === genre; });

      // promoted strip: tracks the community spent riff tokens on
      var promoHtml = '';
      try {
        var pr = await fetch('/api/promotions');
        if (pr.ok){
          var promos = await pr.json();
          if (promos.length){
            promoHtml = "<div class='srh-sec-head'>📣 Promoted</div>" + promos.map(function(p){
              var pvid = self.idFromUrl(p.url || '');
              if (!pvid) return '';
              return "<div class='st-item st-remote promo-item' data-yt='" + escapeHtml(pvid) + "' data-name='" + escapeHtml(p.name || pvid) + "'>"
                + "<button class='icon-btn st-play' title='Play now'>▶</button>"
                + "<span class='name'>" + escapeHtml(p.name || pvid) + "</span>"
                + "<span class='promo-badge' title='Shown · played · liked'>👁 " + Number(p.views || 0) + " · ▶ " + Number(p.plays || 0) + " · 👍 " + Number(p.likes || 0) + "</span>"
                + "<button class='icon-btn st-add' title='Save + add to current playlist'>＋</button>"
                + "</div>";
            }).join('');
            if (window.promoTrack) promoTrack.ids = new Set(promos.map(function(p){
              var mm = /[?&]v=([A-Za-z0-9_-]{11})/.exec(p.url || ''); return mm ? mm[1] : null;
            }).filter(Boolean));
          }
        }
      } catch(e2){ /* strip is optional */ }

      if (!list.length && !promoHtml){
        results.innerHTML = "<div class='empty'>" + (q || genre ? 'Nothing in the database for that' : 'The database is empty') + "</div>";
        this.status('');
        return;
      }
      results.innerHTML = promoHtml
        + (list.length ? "<div class='srh-sec-head'>" + (q || genre ? 'Results' : 'Latest additions') + "</div>" : '')
        + list.map(function(t){
        var vid = self.idFromUrl(t.url || '');
        if (!vid) return '';
        return "<div class='st-item st-remote' data-yt='" + escapeHtml(vid) + "' data-name='" + escapeHtml(t.name || vid) + "'>"
          + "<button class='icon-btn st-play' title='Play now'>▶</button>"
          + "<span class='name'>" + escapeHtml(t.name || vid) + "</span>"
          + (t.genre ? "<span class='dbs-gtag' title='Genre'>" + escapeHtml(t.genre) + "</span>" : '')
          + "<button class='icon-btn st-promote' title='Promote (costs riff tokens)'>📣</button>"
          + "<button class='icon-btn st-add' title='Save + add to current playlist'>＋</button>"
          + "</div>";
      }).join('');
      this.status(q ? 'From the shared database — no YouTube quota used' : 'Latest additions to the database');
    } catch(e){
      results.innerHTML = '';
      this.status('Database unavailable: ' + e.message, 'err');
    }
  }
};

/* ── RANDOM MIX — its own panel, wearing the dice. Builds a fresh playlist
   from the local library: optional tag filter, biased random / most / least
   played (from local history). ── */
var MIX_DICE_SVG =
  "<svg viewBox='0 0 48 48' aria-hidden='true'>" +
    "<defs><linearGradient id='mxg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#8a7bff'/><stop offset='1' stop-color='#46e0ff'/></linearGradient></defs>" +
    "<g transform='rotate(14 33.5 15.5)'>" +
      "<rect x='23' y='5' width='21' height='21' rx='5.5' fill='#15152e' stroke='url(#mxg)' stroke-width='2'/>" +
      "<circle cx='27.2' cy='9.2' r='1.25' fill='url(#mxg)' opacity='0.85'/>" +
      "<circle cx='39.8' cy='21.8' r='1.25' fill='url(#mxg)' opacity='0.85'/>" +
      "<ellipse cx='31.4' cy='19.6' rx='2.9' ry='2.2' fill='url(#mxg)' transform='rotate(-20 31.4 19.6)'/>" +
      "<path d='M34 19.2 L34 10.6 C36.6 11.4 37.6 13 36.8 15.6' fill='none' stroke='url(#mxg)' stroke-width='1.7' stroke-linecap='round'/>" +
    "</g>" +
    "<g transform='rotate(-8 16 28)'>" +
      "<rect x='4.5' y='16.5' width='23' height='23' rx='5.5' fill='#0e0e1c' stroke='url(#mxg)' stroke-width='2'/>" +
      "<circle cx='9.2' cy='21.2' r='1.35' fill='url(#mxg)' opacity='0.85'/>" +
      "<circle cx='22.8' cy='34.8' r='1.35' fill='url(#mxg)' opacity='0.85'/>" +
      "<ellipse cx='13.6' cy='32.6' rx='3.2' ry='2.4' fill='url(#mxg)' transform='rotate(-20 13.6 32.6)'/>" +
      "<path d='M16.5 32.1 L16.5 22.4 C19.4 23.3 20.5 25.1 19.6 28' fill='none' stroke='url(#mxg)' stroke-width='1.8' stroke-linecap='round'/>" +
    "</g>" +
  "</svg>";

var mixBoss = {
  setup(){
    var main =
      "<div class='sec'>" +
        "<div class='sec-head'>Random mix</div>" +
        "<div class='row mix-row'>" +
          "<input type='text' class='mix-tags' placeholder='Tags (optional)…'>" +
          "<select class='mix-bias' title='How to pick'>" +
            "<option value='random' selected>Random</option>" +
            "<option value='most'>Most played</option>" +
            "<option value='least'>Least played</option>" +
          "</select>" +
        "</div>" +
        "<div class='row mix-row'>" +
          "<select class='mix-count' title='How many tracks'>" +
            "<option value='10'>10</option><option value='20' selected>20</option>" +
            "<option value='30'>30</option><option value='50'>50</option>" +
          "</select>" +
          "<button class='icon-btn mix-go' title='Build a new playlist'>🎲 Build mix</button>" +
        "</div>" +
        "<div class='status-bar mix-status'></div>" +
      "</div>";
    this.el = menuB.createMenu(MIX_DICE_SVG.replace(/mxg/g, 'mxgT') + " Random Mix", main);
    menuB.place(this.el, { right:'800px', top:'400px', width:'300px' });
    this.el.querySelector('.mix-go').onclick = () => this.buildMix();
  },

  mixStatus(msg, kind){
    const el = this.el.querySelector('.mix-status');
    el.textContent = msg || '';
    el.className = 'status-bar mix-status' + (kind ? ' ' + kind : '');
    if (msg && kind === 'ok'){ clearTimeout(this._mixT); this._mixT = setTimeout(() => { if (el.textContent === msg) this.mixStatus(''); }, 7000); }
  },

  /* Build a fresh playlist from the local library.
     Pool: all local tracks, optionally narrowed by tags (comma list, any match).
     Bias: random shuffle · most played · least played (from local play history). */
  async buildMix(){
    const root = this.el;
    const tagsQ = (root.querySelector('.mix-tags').value || '').trim().toLowerCase();
    const bias  = root.querySelector('.mix-bias').value;
    const n     = parseInt(root.querySelector('.mix-count').value, 10) || 20;

    let pool = await db.tracks.toArray();
    if (tagsQ){
      const wanted = tagsQ.split(',').map(s => s.trim()).filter(Boolean);
      pool = pool.filter(t => {
        const tt = (t.tags || '').toLowerCase();
        return wanted.some(w => tt.includes(w));
      });
    }
    if (!pool.length){ this.mixStatus(tagsQ ? 'No tracks match those tags' : 'Your library is empty', 'err'); return; }

    if (bias === 'random'){
      for (let i = pool.length - 1; i > 0; i--){          // Fisher–Yates
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    } else {
      const counts = await dbBoss.getPlayCounts();
      const c = t => counts[t.ytId] || 0;
      // tiny random jitter so equal-count tracks vary between builds
      pool.sort((x, y) => (bias === 'most' ? c(y) - c(x) : c(x) - c(y)) || Math.random() - 0.5);
    }

    const picks = pool.slice(0, n);

    // unique "Mix" name: Mix 1, Mix 2, …
    const pls = await dbBoss.getPlaylists();
    let num = 1;
    while (pls.some(p => p.name === 'Mix ' + num)) num++;
    const label = { random:'', most:' · most played', least:' · least played' }[bias] || '';
    const name = 'Mix ' + num + (tagsQ ? ' · ' + tagsQ : '') + label;

    const plId = await dbBoss.createPl(name);
    for (const t of picks) await dbBoss.addToPlaylist(plId, t.id);
    await plBoss.setActivePlaylist(plId);
    plBoss.renderPlPopup();
    this.mixStatus('Built “' + name + '” with ' + picks.length + ' tracks', 'ok');
  },
};
