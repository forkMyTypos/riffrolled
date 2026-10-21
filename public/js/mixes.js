/* riffrolled — mixes.js
   The Mixes panel: three doors, as in the sketch.

     Premade    mixes riffrolled's owner put together (added in the local
                admin tool, kept in the shared database)
     AI DJ      not a list at all — it opens the DJ AI panel
     Community  mixes listeners chose to share

   A mix is a named list of YouTube videos. riffrolled does not supply the
   music — the videos play from YouTube, in YouTube's player, exactly like
   everything else here. A mix is a recommendation, nothing more.

   PLAY and SAVE both turn a mix into an ordinary playlist in THIS browser
   (the same thing DJ AI makes), so after that it is yours: reorder it,
   rename it, add to it. The playlist remembers which mix it came from, so
   pressing Play twice reuses it rather than filling the library with copies.

   SHARING is opt-in and happens here, from the Share button in the Playlist
   panel. The sheet says exactly what leaves the browser: track titles,
   artists and YouTube links, plus the name you choose — and the wallet's
   PUBLIC key, logged for the owner to trace abuse, never shown. Nothing else —
   riffrolled does not know who you are.

   The default is everything closed: the panel opens on the three doors and
   nothing is fetched until you pick one. */

var MIXES_SVG =
  "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='#ffb86b' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'>" +
    "<rect x='3' y='5.5' width='18' height='13' rx='2.2'/>" +
    "<circle cx='8.5' cy='11' r='1.9'/><circle cx='15.5' cy='11' r='1.9'/>" +
    "<path d='M7 18.5l1.6-3.2h6.8L17 18.5'/>" +
  "</svg>";

var MX_ICONS = {
  premade:
    "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>" +
      "<path d='M3 6h13M3 11h9M3 16h6'/><ellipse cx='15.2' cy='17.2' rx='2.8' ry='2.2' transform='rotate(-22 15.2 17.2)'/>" +
      "<path d='M17.8 16.4V7.5c2.2.6 3.4 2 3.2 4.2'/></svg>",
  ai:
    "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>" +
      "<path d='M4 15v-3a8 8 0 0 1 16 0v3'/><rect x='3.5' y='14' width='4' height='6' rx='1.6'/><rect x='16.5' y='14' width='4' height='6' rx='1.6'/></svg>",
  community:
    "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>" +
      "<circle cx='9' cy='8' r='3.2'/><path d='M3 19.5c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2'/>" +
      "<circle cx='17.2' cy='9' r='2.4'/><path d='M16.4 14.4c2.9.1 4.9 1.7 4.9 4.6'/></svg>"
};

var mixesBoss = {
  PAGE: 10,                   // ten at a time: newest or most played, then "Show more"
  view: 'home',               // 'home' | 'premade' | 'community' | 'share'
  sort: 'new',                // community only: 'new' | 'popular'
  genre: '',
  q: '',
  _list: { premade: [], community: [] },
  _more: { premade: false, community: false },
  _shareFor: null,

  setup(){
    var tiles = [
      ['premade',   'Premade',   'By Us'],
      ['ai',        'AI DJ',     'Make a Mix'],
      ['community', 'Community', 'Mixes']
    ].map(function(t){
      return "<button class='mx-tile' data-v='" + t[0] + "' data-testid='mx-tile-" + t[0] + "' aria-pressed='false'>" +
        "<span class='mx-ico'>" + MX_ICONS[t[0]] + "</span>" +
        "<span class='mx-t1'>" + t[1] + "</span><span class='mx-t2'>" + t[2] + "</span></button>";
    }).join('');

    var genreOpts = "<option value=''>All genres</option>" +
      (window.riffGenres ? riffGenres.LIST : []).map(function(g){ return "<option>" + escapeHtml(g) + "</option>"; }).join('');
    var shareGenre = "<option value=''>No genre</option>" + genreOpts.replace("<option value=''>All genres</option>", '');

    var main =
      "<div class='mx-wrap'>" +
        "<div class='mx-tiles'>" + tiles + "</div>" +
        "<div class='mx-view' hidden>" +
          "<div class='mx-filters'>" +
            "<div class='mx-sorts' hidden>" +
              "<button class='mx-sort on' data-s='new'>Newest</button>" +
              "<button class='mx-sort' data-s='popular'>Popular</button>" +
            "</div>" +
            "<select class='mx-genre' aria-label='Filter by genre' data-testid='mx-genre'>" + genreOpts + "</select>" +
            "<input type='search' class='mx-q' placeholder='Search mixes, artists, tracks, moods…' aria-label='Search mixes, artists, tracks and DJ choices' maxlength='60'>" +
          "</div>" +
          "<div class='mx-list scrollable' data-testid='mx-list'></div>" +
        "</div>" +
        "<div class='mx-share' hidden data-testid='mx-share'>" +
          "<div class='sec-head'>Share this mix with everyone</div>" +
          "<label class='mx-lbl'>Name<input type='text' class='mx-sh-name' maxlength='80' data-testid='mx-share-name'></label>" +
          "<label class='mx-lbl'>One line about it (optional)<input type='text' class='mx-sh-blurb' maxlength='200'></label>" +
          "<label class='mx-lbl'>Genre (optional)<select class='mx-sh-genre'>" + shareGenre + "</select></label>" +
          "<label class='mx-chk mx-sh-briefrow' hidden><input type='checkbox' class='mx-sh-brief' checked> <span>Show the DJ AI choices that made this (what you were doing, the feeling, the direction…) next to the mix</span></label>" +
          "<p class='mx-fine mx-sh-what'></p>" +
          "<div class='mx-sh-btns'><button class='mx-sh-go' data-testid='mx-share-go'>Share</button><button class='mx-sh-cancel'>Cancel</button></div>" +
        "</div>" +
        "<div class='status-bar mx-status' data-testid='mx-status'></div>" +
        "<div class='mx-note'>A mix is a list of YouTube videos. The music plays from YouTube — riffrolled just helps you find it.</div>" +
      "</div>";

    this.el = menuB.createMenu(MIXES_SVG + ' Mixes', main);
    menuB.place(this.el, { right:'470px', top:'90px', width:'360px', height:'auto' });
    this.el.classList.add('mixes-panel');
    this.bind();
  },

  bind(){
    var self = this, el = this.el;
    el.querySelector('.mx-tiles').addEventListener('click', function(e){
      var b = e.target.closest('.mx-tile'); if (!b) return;
      self.choose(b.dataset.v);
    });
    el.querySelector('.mx-sorts').addEventListener('click', function(e){
      var b = e.target.closest('.mx-sort'); if (!b) return;
      self.sort = b.dataset.s;
      el.querySelectorAll('.mx-sort').forEach(function(x){ x.classList.toggle('on', x === b); });
      self.load('community', true);
    });
    el.querySelector('.mx-genre').addEventListener('change', function(){ self.genre = this.value; self.load(self.view, true); });
    el.querySelector('.mx-q').addEventListener('input', function(){
      var v = this.value; clearTimeout(self._qt);
      self._qt = setTimeout(function(){ self.q = v.trim(); self.load(self.view, true); }, 250);
    });
    el.querySelector('.mx-list').addEventListener('click', function(e){ self.onList(e); });
    el.querySelector('.mx-sh-cancel').addEventListener('click', function(){ self.choose('home'); });
    el.querySelector('.mx-sh-go').addEventListener('click', function(){ self.submitShare(); });
  },

  status(msg, kind){
    var s = this.el.querySelector('.mx-status');
    s.textContent = msg || '';
    s.className = 'status-bar mx-status' + (kind ? ' ' + kind : '');
    clearTimeout(this._st);
    if (msg && kind === 'ok'){ var self = this; this._st = setTimeout(function(){ if (s.textContent === msg) self.status(''); }, 5000); }
  },

  /** Open the panel from elsewhere (the Playlist panel's Share button, the agent API). */
  open(){ if (window.dock) dock.openPanel(this.el); },

  /* ── the three doors ─────────────────────────────────────────────── */
  choose(v){
    if (v === 'ai'){
      if (window.dock && window.djMenuBoss) dock.openPanel(djMenuBoss.el);
      return;
    }
    // choosing the open door again closes it: back to the three doors
    if (v === this.view && v !== 'home') v = 'home';
    this.view = v;
    var el = this.el;
    el.querySelectorAll('.mx-tile').forEach(function(b){
      var on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var isList = v === 'premade' || v === 'community';
    el.querySelector('.mx-view').hidden = !isList;
    el.querySelector('.mx-share').hidden = v !== 'share';
    el.querySelector('.mx-sorts').hidden = v !== 'community';
    this.status('');
    el.setAttribute('data-view', v);
    if (isList) this.load(v, true);
  },

  /* ── lists ───────────────────────────────────────────────────────── */
  async load(kind, fresh){
    if (kind !== 'premade' && kind !== 'community') return;
    var list = this.el.querySelector('.mx-list');
    if (fresh){ this._list[kind] = []; list.innerHTML = "<div class='empty'>Loading…</div>"; }
    var offset = this._list[kind].length;
    var url = '/api/mixes?kind=' + kind + '&limit=' + this.PAGE + '&offset=' + offset +
      (kind === 'community' ? '&sort=' + this.sort : '') +
      (this.genre ? '&genre=' + encodeURIComponent(this.genre) : '') +
      (this.q ? '&q=' + encodeURIComponent(this.q) : '');
    var j;
    try {
      var r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      j = await r.json();
    } catch(e){
      if (this.view === kind) list.innerHTML = "<div class='empty'>Couldn’t reach riffrolled just now.<br>Check your connection and try again.</div>";
      return;
    }
    if (this.view !== kind) return;          // they moved on while it loaded
    this._list[kind] = this._list[kind].concat(j.mixes || []);
    this._more[kind] = (j.mixes || []).length >= this.PAGE;
    this.render(kind);
  },

  render(kind){
    var list = this.el.querySelector('.mx-list');
    var rows = this._list[kind];
    if (!rows.length){
      list.innerHTML = "<div class='empty' data-testid='mx-empty'>" + (this.genre || this.q
        ? 'No mixes match that.'
        : kind === 'premade'
          ? 'No premade mixes yet.<br>Make your own with AI DJ in the meantime.'
          : 'Nothing shared yet.<br>Be the first — open one of your playlists and press Share.') + "</div>";
      return;
    }
    list.innerHTML = rows.map(function(m){ return mixesBoss.card(m); }).join('') +
      (this._more[kind] ? "<button class='mx-loadmore'>Show more</button>" : '');
  },

  card(m){
    var cover = m.cover
      ? "<img class='mx-cover' src='https://i.ytimg.com/vi/" + escapeHtml(m.cover) + "/default.jpg' alt='' width='48' height='48' loading='lazy'>"
      : "<span class='mx-cover mx-nocover' aria-hidden='true'></span>";
    var sub = m.blurb || (m.artists && m.artists.length ? m.artists.join(', ') + (m.tracks > m.artists.length ? ' & more' : '') : '');
    var meta = [];
    if (m.genre) meta.push("<span class='mx-chip'>" + escapeHtml(m.genre) + "</span>");
    meta.push(m.tracks + (m.tracks === 1 ? ' track' : ' tracks'));
    if (m.kind === 'community' && m.plays) meta.push(m.plays + (m.plays === 1 ? ' play' : ' plays'));
    return "<div class='mx-card' data-id='" + Number(m.id) + "' data-slug='" + escapeHtml(m.slug || '') + "' data-testid='mx-card'>" +
      cover +
      "<div class='mx-info'>" +
        "<div class='mx-name' title='" + escapeHtml(m.name) + "'>" + escapeHtml(m.name) + "</div>" +
        (sub ? "<div class='mx-sub'>" + escapeHtml(sub) + "</div>" : '') +
        "<div class='mx-meta'>" + meta.join(" <span class='mx-dot'>·</span> ") + "</div>" +
      "</div>" +
      "<div class='mx-acts'>" +
        "<button class='mx-play' title='Play this mix' aria-label='Play this mix' data-testid='mx-play'>▶</button>" +
        "<button class='mx-save' title='Save to my playlists' aria-label='Save to my playlists' data-testid='mx-save'>＋</button>" +
        "<button class='mx-tog' title='Show the tracks' aria-label='Show the tracks' aria-expanded='false'>▾</button>" +
      "</div>" +
      "<div class='mx-tracks' hidden></div>" +
    "</div>";
  },

  async onList(e){
    var more = e.target.closest('.mx-loadmore');
    if (more){ this.load(this.view, false); return; }
    if (e.target.closest('.mx-back')){ this.choose('home'); return; }
    var card = e.target.closest('.mx-card'); if (!card) return;
    var id = Number(card.dataset.id);
    if (e.target.closest('.mx-play')) return this.act(id, 'play', card);
    if (e.target.closest('.mx-save')) return this.act(id, 'save', card);
    if (e.target.closest('.mx-report')) return this.report(id, card);
    if (e.target.closest('.mx-link')) return this.copyLink(card.dataset.slug, (card.querySelector('.mx-name') || {}).textContent);
    if (e.target.closest('.mx-tog') || e.target.closest('.mx-name')) return this.toggle(card, id);
  },

  /* The DJ AI choices that may travel with a shared mix: which options were
     picked, the familiarity and the length. Never whether the listener let the
     AI see their library — that is theirs. The server rebuilds it again. */
  shareableBrief(b){
    if (!b || typeof b !== 'object' || !b.picks) return null;
    var out = { picks: {} };
    Object.keys(b.picks).slice(0, 12).forEach(function(k){ if (b.picks[k]) out.picks[k] = String(b.picks[k]).slice(0, 80); });
    ['familiarity', 'count', 'minutes', 'maxTrackMin'].forEach(function(k){ if (typeof b[k] === 'number') out[k] = b[k]; });
    if (b.chaos) out.chaos = true;
    return Object.keys(out.picks).length || typeof out.familiarity === 'number' ? out : null;
  },

  BRIEF_ORDER: ['activity', 'feel', 'direction', 'discovery', 'personality', 'energy', 'era', 'speed'],
  BRIEF_LABEL: { activity: 'Doing', feel: 'Feel', direction: 'Direction', discovery: 'Discovery', personality: 'DJ',
                 energy: 'Energy', era: 'Era', speed: 'Speed' },

  /** "How it was made": the choices behind a mix, as small labelled chips. Text only. */
  briefHtml(b){
    if (!b) return '';
    var self = this, chips = [];
    var keys = Object.keys(b.picks || {});
    keys.sort(function(a, c){
      var i = self.BRIEF_ORDER.indexOf(a), j = self.BRIEF_ORDER.indexOf(c);
      return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
    });
    keys.forEach(function(k){
      var lab = self.BRIEF_LABEL[k] || (k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '));
      chips.push("<li class='mx-bchip'><span class='mx-bk'>" + escapeHtml(lab) + "</span> " + escapeHtml(b.picks[k]) + "</li>");
    });
    var facts = [];
    if (typeof b.familiarity === 'number') facts.push(b.familiarity + '% familiar, ' + (100 - b.familiarity) + '% discovery');
    if (b.chaos) facts.push('chaos mode');
    if (b.count) facts.push(b.count + ' tracks');
    if (b.minutes) facts.push('about ' + b.minutes + ' min');
    var more = '';
    if (b.journey) more += "<div class='mx-bnote'><span class='mx-bk'>The journey</span> " + escapeHtml(b.journey) + "</div>";
    if (b.avoid) more += "<div class='mx-bnote'><span class='mx-bk'>Avoid</span> " + escapeHtml(b.avoid) + "</div>";
    if (!chips.length && !facts.length && !more) return '';
    return "<div class='mx-brief' data-testid='mx-brief'><div class='mx-bh'>How it was made</div>" +
      (chips.length ? "<ul class='mx-bchips'>" + chips.join('') + "</ul>" : '') +
      (facts.length ? "<div class='mx-bfacts'>" + escapeHtml(facts.join(' · ')) + "</div>" : '') + more + "</div>";
  },

  async fetchMix(id){
    var r = await fetch('/api/mixes/' + id);
    if (r.status === 404) throw new Error('That mix is no longer there');
    if (!r.ok) throw new Error('Couldn’t reach riffrolled');
    return await r.json();
  },

  async toggle(card, id){
    var box = card.querySelector('.mx-tracks'), btn = card.querySelector('.mx-tog');
    if (!box.hidden){ box.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.textContent = '▾'; return; }
    box.hidden = false; btn.setAttribute('aria-expanded', 'true'); btn.textContent = '▴';
    if (box.dataset.loaded) return;
    box.innerHTML = "<div class='mx-fine'>Loading…</div>";
    try {
      var m = await this.fetchMix(id);
      box.dataset.loaded = '1';
      box.innerHTML = this.briefHtml(m.brief) + "<ol class='mx-tl'>" + m.items.map(function(t){
        return "<li>" + (t.artist ? "<span class='mx-ta'>" + escapeHtml(t.artist) + "</span> — " : '') + escapeHtml(t.name || t.ytId) +
          (t.note ? "<div class='mx-why'>" + escapeHtml(t.note) + "</div>" : '') + "</li>";
      }).join('') + "</ol>" +
      "<div class='mx-foot'>" +
        (m.slug ? "<button class='mx-link' data-testid='mx-link' title='Copy a link to this mix — anyone with it can open it'>" +
          "<img class='mx-link-ico' src='img/share-icon.webp' alt='' width='18' height='18'> Copy link</button>" : '') +
        (m.kind === 'community' ? "<button class='mx-report' title='Tell riffrolled this mix shouldn’t be here'>⚑ Report this mix</button>" : '') +
      "</div>";
    } catch(err){ box.innerHTML = "<div class='mx-fine'>" + escapeHtml(err.message) + "</div>"; }
  },

  /* ── share links: riffrolled.com/?m=<code> ───────────────────────────
     A link carries an 8-character random code, never a row number. Opening
     one shows that mix on its own, with Play and Save, and nothing plays
     until the person presses it. A mix that is hidden, still waiting for
     approval, or gone says so in words rather than opening empty. */
  linkFor(slug){ return location.origin + '/?m=' + slug; },

  async copyLink(slug, name){
    if (!slug){ this.status('That mix has no link yet — try again in a moment', 'warn'); return; }
    var link = this.linkFor(slug);
    // phones: the native share sheet, which is where people send links from
    if (navigator.share && document.body.classList.contains('mobile')){
      try { await navigator.share({ title: name || 'A mix on riffrolled', text: 'A mix on riffrolled', url: link }); return; }
      catch(e){ if (e && e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(link);
      this.status('Link copied — ' + link.replace(/^https?:\/\//, ''), 'ok');
    } catch(e){
      this.status('Copy this link: ' + link, 'warn');      // stays up so it can be selected by hand
    }
  },

  /** the page was opened with ?m=<code> */
  async openFromUrl(code){
    try { history.replaceState(null, '', location.pathname + location.hash); } catch(e){}   // a reload must not reopen it
    this.open();
    if (!/^[a-hj-km-np-z2-9]{8}$/.test(code)){ this.status('That link doesn’t look right — it may have been cut short', 'warn'); return; }
    this.status('Opening the shared mix…');
    try {
      var r = await fetch('/api/mixes/' + code);
      if (r.status === 404){ this.status('That mix isn’t available. It may have been removed, or it’s still waiting to be approved.', 'warn'); return; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      this.showLinked(await r.json());
    } catch(e){ this.status('Couldn’t open that link just now. Check your connection and try again.', 'err'); }
  },

  showLinked(m){
    this.choose('home');                       // reset the doors, then show one mix on its own
    var el = this.el;
    var items = m.items || [];
    m.cover = items[0] ? items[0].ytId : '';
    m.artists = items.map(function(t){ return t.artist; }).filter(function(a, i, arr){ return a && arr.indexOf(a) === i; }).slice(0, 3);
    this.view = 'linked';
    el.setAttribute('data-view', 'linked');
    el.querySelector('.mx-view').hidden = false;
    el.querySelector('.mx-sorts').hidden = true;
    el.querySelector('.mx-list').innerHTML =
      "<div class='mx-linked-head' data-testid='mx-linked'>Shared with you</div>" + this.card(m) +
      "<button class='mx-back'>← See all mixes</button>";
    var card = el.querySelector('.mx-list .mx-card');
    this.status('');
    this.toggle(card, m.id);                   // open its track list straight away
  },

  /* ── Play and Save: a mix becomes a playlist in this browser ─────── */
  async toLocal(mix){
    var pls = await dbBoss.getPlaylists();
    var have = pls.find(function(p){ return p.mixId === mix.id; });
    if (have) return { id: have.id, existed: true };

    var name = mix.name, n = 2;
    while (pls.some(function(p){ return p.name === name; })) name = mix.name + ' ' + (n++);
    var plId = await dbBoss.createPl(name);
    await db.playlists.update(plId, { mixId: mix.id, source: 'mix' });

    for (var i = 0; i < mix.items.length; i++){
      var it = mix.items[i];
      try {
        var tid = await dbBoss.createTrack(it.ytId, it.name);
        var row = await dbBoss.getTrack(it.ytId), meta = {};
        if (row){
          if (!row.artist && it.artist) meta.artist = it.artist;
          if (!row.genre && it.genre) meta.genre = it.genre;
          if (Object.keys(meta).length) await dbBoss.updateTrackMeta(it.ytId, meta);
        }
        await dbBoss.addToPlaylist(plId, tid);
      } catch(e){ /* one bad row must not lose the mix */ }
    }
    return { id: plId, existed: false };
  },

  async act(id, what, card){
    var btn = card.querySelector(what === 'play' ? '.mx-play' : '.mx-save');
    btn.disabled = true;
    try {
      var mix = await this.fetchMix(id);
      if (!mix.items.length) throw new Error('That mix has no playable tracks');
      var res = await this.toLocal(mix);
      if (what === 'play'){
        await plBoss.setActivePlaylist(res.id);
        await plBoss.renderTracks();
        plBoss.renderPlaylists();
        plBoss.playIndex(0);
        try { fetch('/api/mixes/' + id + '/play', { method:'POST' }); } catch(e){}
        this.status('Playing “' + mix.name + '”', 'ok');
      } else {
        plBoss.renderPlaylists();
        this.status(res.existed ? '“' + mix.name + '” is already in your playlists' : 'Saved “' + mix.name + '” to your playlists', 'ok');
      }
    } catch(err){
      this.status(err && err.message || 'That didn’t work', 'err');
    }
    btn.disabled = false;
  },

  async report(id, card){
    var btn = card.querySelector('.mx-report');
    try {
      var r = await fetch('/api/mixes/' + id + '/report', { method:'POST' });
      if (!r.ok) throw new Error();
      var j = await r.json();
      if (btn){ btn.disabled = true; btn.textContent = 'Reported — thank you'; }
      if (j.hidden) this.load('community', true);
    } catch(e){ this.status('Couldn’t send that report', 'err'); }
  },

  /* ── sharing ─────────────────────────────────────────────────────── */
  MIN_TRACKS: 3,

  async openShare(playlistId){
    var id = playlistId || (window.plBoss && plBoss.activeId);
    var pl = id && await db.playlists.get(id);
    if (!pl){ appNotify('Pick a playlist to share first', 'warn'); return; }
    var joins = await db.playlistTracks.where('playlistId').equals(id).sortBy('order');
    var rows = [];
    for (var i = 0; i < joins.length; i++){
      var t = await db.tracks.get(joins[i].trackId);
      if (t && t.ytId && t.playable !== 0) rows.push(t);
    }
    if (rows.length < this.MIN_TRACKS){
      appNotify('A mix needs at least ' + this.MIN_TRACKS + ' tracks that play', 'warn'); return;
    }
    this._shareFor = { id: id, rows: rows.slice(0, 50), brief: this.shareableBrief(pl.aiBrief) };
    this.open();
    this.choose('share');
    var el = this.el;
    el.querySelector('.mx-sh-name').value = String(pl.name || '').replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 80);
    el.querySelector('.mx-sh-blurb').value = '';
    var g = rows.map(function(r){ return r.genre; }).filter(Boolean)[0] || '';
    el.querySelector('.mx-sh-genre').value = g;
    var bRow = el.querySelector('.mx-sh-briefrow');
    bRow.hidden = !this._shareFor.brief;
    el.querySelector('.mx-sh-brief').checked = true;
    el.querySelector('.mx-sh-what').textContent =
      this._shareFor.rows.length + ' tracks will be shared: their titles, artists and YouTube links, in this order, with the name above. ' +
      'Anyone will be able to play it. Your wallet’s public key is recorded so abuse can be traced — it isn’t shown to anyone, and nothing else about you goes with it. ' +
      'The first share from a new key gets a quick check by a person before it’s listed.';
    el.querySelector('.mx-sh-go').disabled = false;
    el.querySelector('.mx-sh-name').focus();
  },

  async submitShare(){
    var s = this._shareFor; if (!s) return;
    var el = this.el, go = el.querySelector('.mx-sh-go');
    var name = el.querySelector('.mx-sh-name').value.trim();
    if (name.length < 3){ this.status('Give it a name — at least 3 characters', 'err'); return; }
    go.disabled = true; this.status('Checking the links and sharing…');
    try {
      var r = await fetch('/api/mixes/share', {
        // the private key rides in a header so the server can log the sharer's
        // PUBLIC key (admin-only); it is never stored or shown
        method: 'POST', headers: Object.assign({ 'content-type':'application/json' }, window.riffWallet ? await riffWallet.headers() : {}),
        body: JSON.stringify({
          name: name,
          blurb: el.querySelector('.mx-sh-blurb').value.trim(),
          genre: el.querySelector('.mx-sh-genre').value,
          brief: (s.brief && el.querySelector('.mx-sh-brief').checked) ? s.brief : undefined,
          tracks: s.rows.map(function(t){
            return { name: t.name || '', artist: t.artist || '', genre: t.genre || '', url: 'https://www.youtube.com/watch?v=' + t.ytId };
          })
        })
      });
      var j = null; try { j = await r.json(); } catch(e){}
      if (!r.ok) throw new Error((j && j.error) || 'That didn’t work (HTTP ' + r.status + ')');
      try { await db.playlists.update(s.id, { sharedMixId: j.id, sharedSlug: j.slug || '' }); } catch(e){}
      this._shareFor = null;
      this.sort = 'new';
      this.view = 'home';
      this.choose('community');
      this.status(j.pending
        ? (j.existing ? 'That exact mix is already waiting for its quick check'
                      : 'Thanks — “' + j.name + '” is waiting for a quick check. A person looks at the first share from each key; once yours is approved it goes up, and so does everything you share after.')
        : j.existing ? 'That exact mix is already shared — open it in Community and press “Copy link”' : 'Shared “' + j.name + '” — thank you. Open it in Community and press “Copy link” to send it to someone.',
        j.pending ? '' : 'ok');            // the waiting note stays up: it is worth reading
    } catch(err){
      this.status(err.message, 'err');
      go.disabled = false;
    }
  }
};

/* Opened from a shared link (riffrolled.com/?m=<code>): wait for the saved
   layout to be restored, then show that mix. */
(function(){
  var code = new URLSearchParams(location.search).get('m');
  if (code === null) return;
  var n = 0, t = setInterval(function(){
    if ((window.dock && dock._ready) || ++n > 100){ clearInterval(t); mixesBoss.openFromUrl(code); }
  }, 100);
})();
