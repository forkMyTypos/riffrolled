/* riffrolled — aidj.js
   AI DJ: you say what you want to hear, your own AI writes the playlist,
   riffrolled resolves it against real YouTube videos, saves it like any
   other playlist, and plays it.

   Riffrolled supplies the music. Your AI supplies the taste.

   Why copy and paste: nobody needs an API key, a subscription or an
   account to use this — they use the AI they already have open. That is
   the feature, not a workaround. The flow is deliberately split so the
   manual step is one replaceable adapter:

     aiDj.brief()           what the DJ is being asked for (request, objective, length)
     aiDj.buildPrompt()     brief + what you already listen to → prompt text
     aiDj.parseReply()      whatever the AI said → [{ artist, title, url, why }]
     aiDj.resolve()         items → real YouTube videos (validated, never trusted)
     aiDj.save()            resolved items → a Dexie playlist + session record
     aiDj.adapters.*        how the prompt reaches an AI and the reply comes back

   adapters.copypaste is the only one today: it hands the prompt to the
   clipboard and waits for the reply to be pasted. A future adapter (a
   browser AI, a connected service) only has to implement run(brief) and
   return reply text — nothing below it changes. */

var aiDj = {

  MAX_TRACKS: 30,          // /api/resolve won't take more in one request

  /* ── objectives: the familiar ←→ discovery spectrum, as plain words ── */
  OBJECTIVES: {
    familiar: {
      label: 'Familiar',
      hint: 'Mostly things I already listen to.',
      line: 'Stay close to what I already listen to. Favour the artists and styles listed below; a couple of their lesser-known tracks is fine.'
    },
    mixed: {
      label: 'Mixed',
      hint: 'Half what I know, half new.',
      line: 'Mix it: about half from the artists and styles I already listen to, about half from artists I have not listened to.'
    },
    fresh: {
      label: 'Fresh',
      hint: 'Only things I have not heard.',
      line: 'Only artists and tracks that are NOT in my library below. This is a discovery session — do not include anything I already have.'
    },
    surprise: {
      label: 'Surprise me',
      hint: 'Take me somewhere else.',
      line: 'Take me somewhere I would not have gone myself. Deliberately away from the styles listed below, while still being genuinely good listening.'
    }
  },

  /* ── what the DJ is being asked for ── */
  brief(){
    return {
      request: this._request || '',
      objective: this._objective || 'mixed',
      count: this._count || 15
    };
  },

  /* ── the listening profile, from data riffrolled already keeps ──
     Most played, recently played, what got a 👍, the tags you type and
     the artists you fill in. All local — this is read out of Dexie and
     pasted into your AI by you; riffrolled sends none of it anywhere. */
  async profile(limit){
    var out = { top: [], liked: [], recent: [], tags: [], have: [], size: 0 };
    try {
      var tracks = await db.tracks.toArray();
      out.size = tracks.length;
      if (!tracks.length) return out;

      var counts = await dbBoss.getPlayCounts();
      var byYt = {};
      tracks.forEach(function(t){ byYt[t.ytId] = t; });

      var label = function(t){
        return (t.artist ? t.artist + ' — ' : '') + (t.name || t.ytId);
      };

      // most played
      out.top = tracks.slice()
        .sort(function(a, b){ return (counts[b.ytId] || 0) - (counts[a.ytId] || 0); })
        .filter(function(t){ return (counts[t.ytId] || 0) > 0; })
        .slice(0, limit || 12)
        .map(function(t){ return label(t) + ' (' + counts[t.ytId] + ' plays)'; });

      // liked (a tally, so count them)
      var likes = {};
      (await db.reactions.where('kind').equals('like').toArray())
        .forEach(function(r){ likes[r.ytId] = (likes[r.ytId] || 0) + 1; });
      out.liked = Object.keys(likes)
        .sort(function(a, b){ return likes[b] - likes[a]; })
        .slice(0, 10)
        .map(function(y){ return byYt[y] ? label(byYt[y]) : null; })
        .filter(Boolean);

      // recently played
      var hist = await db.playHistory.orderBy('ts').reverse().limit(40).toArray();
      var seen = {};
      hist.forEach(function(h){
        if (seen[h.ytId] || !byYt[h.ytId]) return;
        seen[h.ytId] = 1;
        if (out.recent.length < 10) out.recent.push(label(byYt[h.ytId]));
      });

      // tags the user types themselves
      var tagCount = {};
      tracks.forEach(function(t){
        (t.tags || '').split(',').forEach(function(raw){
          var tag = raw.trim().toLowerCase();
          if (tag) tagCount[tag] = (tagCount[tag] || 0) + 1;
        });
      });
      out.tags = Object.keys(tagCount)
        .sort(function(a, b){ return tagCount[b] - tagCount[a]; })
        .slice(0, 14);

      // for a discovery session: what NOT to hand back. Artists where we
      // know them, titles otherwise — capped so the prompt stays pasteable.
      var artists = {};
      tracks.forEach(function(t){ if (t.artist) artists[t.artist.trim()] = 1; });
      out.have = Object.keys(artists).slice(0, 60);
      if (out.have.length < 12){
        out.have = out.have.concat(tracks.slice(0, 40).map(function(t){ return t.name || ''; }).filter(Boolean));
      }
    } catch(e){ /* a profile is a bonus, never a requirement */ }
    return out;
  },

  /* ── the prompt. No provider is named and no key is involved: this is
     text for whichever AI the user already has open. ── */
  async buildPrompt(brief){
    brief = brief || this.brief();
    var obj = this.OBJECTIVES[brief.objective] || this.OBJECTIVES.mixed;
    var p = await this.profile();
    var L = [];

    L.push('You are my personal music DJ.');
    L.push('You are not creating music. You are choosing what I should listen to next.');
    L.push('');
    L.push('WHAT I WANT: ' + (brief.request || 'your choice — surprise me'));
    L.push('HOW MANY TRACKS: ' + brief.count);
    L.push('HOW FAMILIAR: ' + obj.line);
    L.push('');

    if (p.top.length){      L.push('WHAT I PLAY MOST:');        p.top.forEach(function(x){ L.push('  - ' + x); }); }
    if (p.liked.length){    L.push('TRACKS I HAVE LIKED:');     p.liked.forEach(function(x){ L.push('  - ' + x); }); }
    if (p.recent.length){   L.push('PLAYED RECENTLY:');         p.recent.forEach(function(x){ L.push('  - ' + x); }); }
    if (p.tags.length){     L.push('TAGS I USE: ' + p.tags.join(', ')); }
    if (!p.size){           L.push('(My library is empty — this is my first session, so choose for me.)'); }
    if (p.have.length && (brief.objective === 'fresh' || brief.objective === 'surprise')){
      L.push('ALREADY IN MY LIBRARY — do not pick these: ' + p.have.join(', '));
    }
    L.push('');

    L.push('REPLY IN THIS EXACT FORMAT. I paste your whole reply straight back into riffrolled,');
    L.push('so put nothing before or after the block:');
    L.push('');
    L.push('RIFFROLLED-PLAYLIST');
    L.push('NAME: a short name for this playlist');
    L.push('1 | Artist | Track title | optional youtube link | why it is here (a few words)');
    L.push('2 | Artist | Track title | | why it is here');
    L.push('END');
    L.push('');
    L.push('Rules:');
    L.push('  - One track per line, numbered, in the order I should hear them.');
    L.push('  - Artist and title are required, and must be accurate enough to find the track on YouTube.');
    L.push('  - The link is OPTIONAL. Only include one if you have genuinely verified that video exists.');
    L.push('    A wrong link is worse than none: leave it blank and riffrolled will find the track itself.');
    L.push('  - Real, released tracks only. Do not invent songs, and do not repeat a track.');
    L.push('  - No commentary outside the block.');
    L.push('');
    L.push('JSON is also accepted if you prefer:');
    L.push('  {"name":"...","tracks":[{"artist":"...","title":"...","url":"","why":"..."}]}');

    return L.join('\n');
  },

  /* ── parsing whatever came back ──────────────────────────────────────
     Chat UIs reflow text, models add preambles, wrap things in code
     fences, number lines differently or answer in JSON because they felt
     like it. So: try JSON, then the pipe format, then a markdown table,
     then plain "Artist - Title" lines. Returns { name, items } and never
     throws — an empty items array is the "I could not read this" signal. */
  parseReply(text){
    var raw = String(text || '').trim();
    if (!raw) return { name:'', items:[] };

    // strip code fences, keep their contents
    raw = raw.replace(/^\s*```[a-zA-Z]*\s*/gm, '').replace(/```\s*$/gm, '');

    var out = this._parseJson(raw);
    if (!out.items.length) out = this._parseLines(raw);
    out.items = this._dedupe(out.items).slice(0, this.MAX_TRACKS);
    return out;
  },

  _clean(s){ return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().replace(/^["'`*_\s]+|["'`*_\s]+$/g, ''); },

  _ytId(s){
    var m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(s)
         || /youtu\.be\/([A-Za-z0-9_-]{11})/.exec(s)
         || /\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})/.exec(s)
         || /^([A-Za-z0-9_-]{11})$/.exec(String(s || '').trim());
    return m ? m[1] : null;
  },

  _dedupe(items){
    var seen = {}, out = [];
    items.forEach(function(it){
      if (!it || (!it.title && !it.artist)) return;
      var key = (it.artist + '|' + it.title).toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      out.push(it);
    });
    return out;
  },

  _parseJson(raw){
    var self = this, res = { name:'', items:[] };
    // the first {...} or [...] that parses — models like to chat first
    var starts = [raw.indexOf('{'), raw.indexOf('[')].filter(function(i){ return i >= 0; });
    if (!starts.length) return res;
    var from = Math.min.apply(null, starts);
    var ends = [raw.lastIndexOf('}'), raw.lastIndexOf(']')];
    var to = Math.max.apply(null, ends);
    if (to <= from) return res;
    var obj;
    try { obj = JSON.parse(raw.slice(from, to + 1)); } catch(e){ return res; }

    var list = Array.isArray(obj) ? obj
      : (Array.isArray(obj.tracks) ? obj.tracks
      : (Array.isArray(obj.playlist) ? obj.playlist
      : (Array.isArray(obj.items) ? obj.items : null)));
    if (!list) return res;
    if (!Array.isArray(obj) && obj.name) res.name = self._clean(obj.name);

    list.forEach(function(row){
      if (typeof row === 'string'){
        var dash = self._splitDash(row);
        if (dash) res.items.push(dash);
        return;
      }
      if (!row || typeof row !== 'object') return;
      var title = self._clean(row.title || row.track || row.song || row.name);
      var artist = self._clean(row.artist || row.by || row.channel || row.band);
      if (!title && !artist) return;
      res.items.push({
        artist: artist,
        title: title,
        url: self._ytId(row.url || row.link || row.youtube || row.videoId || row.id || '') || '',
        why: self._clean(row.why || row.reason || row.note || row.comment)
      });
    });
    return res;
  },

  // "Artist - Title" / "Artist – Title" / "Artist — Title", but not a
  // title that merely contains a hyphen
  _splitDash(line){
    var m = /^(.{1,120}?)\s+[-–—]\s+(.+)$/.exec(this._clean(line));
    if (!m) return null;
    return { artist: this._clean(m[1]), title: this._clean(m[2]), url:'', why:'' };
  },

  _parseLines(raw){
    var self = this, res = { name:'', items:[] };
    var lines = raw.split(/\r?\n/);

    lines.forEach(function(line){
      var l = line.trim();
      if (!l) return;

      var nameM = /^#*\s*(?:NAME|PLAYLIST|TITLE)\s*[:\-]\s*(.+)$/i.exec(l);
      if (nameM && !res.name){ res.name = self._clean(nameM[1]); return; }
      if (/^(RIFFROLLED-PLAYLIST|END)\s*$/i.exec(l)) return;

      // drop a leading "1.", "2)", "- ", "* ", or "3 - " (a numbered line
      // whose separator is itself a dash — the dash split must not take
      // the number for the artist)
      var body = l.replace(/^\s*(?:[-*•]\s*)?(?:\d{1,2}\s*[\.\)\:]\s*|\d{1,2}\s+[-–—]\s+)?/, '');

      if (body.indexOf('|') >= 0){
        var cells = body.split('|').map(function(c){ return self._clean(c); });
        // a markdown table row starts and ends with a pipe, so loses an
        // empty cell at each end; a separator row is all dashes
        if (!cells[0] && cells.length > 1) cells.shift();
        if (cells.length && !cells[cells.length - 1]) cells.pop();
        if (!cells.length) return;
        if (cells.every(function(c){ return /^:?-{2,}:?$/.test(c); })) return;
        // a leftover index cell ("1" on its own) from the table form
        if (/^\d{1,2}$/.test(cells[0]) && cells.length > 2) cells.shift();
        if (/^(artist|#|no\.?)$/i.test(cells[0])) return;         // table header

        var artist = cells[0] || '', title = cells[1] || '', url = '', why = '';
        for (var i = 2; i < cells.length; i++){
          var id = self._ytId(cells[i]);
          if (id && !url) url = id;
          else if (cells[i] && !why) why = cells[i];
        }
        if (!title && artist){ var d = self._splitDash(artist); if (d){ artist = d.artist; title = d.title; } }
        if (!title && !artist) return;
        res.items.push({ artist: artist, title: title, url: url, why: why });
        return;
      }

      // plain "Artist - Title", optionally trailed by a link
      var urlM = /(https?:\/\/\S+)/.exec(body);
      var id2 = urlM ? self._ytId(urlM[1]) : null;
      var textPart = urlM ? body.replace(urlM[1], '').replace(/[\s\-–—|]+$/, '') : body;
      var dash2 = self._splitDash(textPart);
      if (dash2){ dash2.url = id2 || ''; res.items.push(dash2); }
    });

    return res;
  },

  /* ── resolution ──────────────────────────────────────────────────────
     An AI's video id is a hint and nothing more — a model reproducing an
     11-character id from memory is guessing at a random string. So:

       1. if it gave a link, validate it here in the browser with
          YouTube's oEmbed endpoint. No key, no API quota, and it returns
          the real title and channel, which we check against what the AI
          claimed it was.
       2. whatever is left goes to /api/resolve, which tries our own
          catalogue first (free) and only then spends YouTube search
          quota, inside a per-request cap and a daily budget.

     onProgress(done, total, label) is called as it goes. */
  async resolve(items, opts){
    opts = opts || {};
    var self = this;
    var progress = opts.onProgress || function(){};
    var out = items.map(function(it){ return { item: it, ok:false, via:null }; });
    var done = 0, total = items.length;

    // ── 1. free validation of anything that came with a link ──
    for (var i = 0; i < items.length; i++){
      var it = items[i];
      progress(done, total, it.title || it.artist);
      if (it.url){
        var v = await self.oembed(it.url);
        if (v) out[i].verified = v;          // real title + channel, from YouTube
      }
      done++;
    }
    progress(done, total, 'checking the catalogue…');

    // ── 2. the rest, server side: catalogue first, then capped YouTube ──
    var payload = items.map(function(it, i){
      return {
        artist: it.artist, title: it.title,
        videoId: it.url || '',
        verified: out[i].verified || null
      };
    });

    var data;
    try {
      var r = await fetch('/api/resolve', {
        method:'POST', headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ items: payload, allowYouTube: opts.allowYouTube !== false })
      });
      data = await r.json();
      if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    } catch(e){
      // offline or the endpoint is down: anything we validated locally is
      // still playable, the rest simply didn't resolve
      data = { results: out.map(function(o, i){
        return o.verified
          ? { i:i, ok:true, via:'link', url:'https://www.youtube.com/watch?v=' + items[i].url,
              name:o.verified.name, artist:o.verified.artist }
          : { i:i, ok:false, reason:'offline' };
      }) };
      data.offline = e.message;
    }

    (data.results || []).forEach(function(r){
      if (!r || typeof r.i !== 'number' || !out[r.i]) return;
      out[r.i].ok = !!r.ok;
      out[r.i].via = r.via || null;
      out[r.i].reason = r.reason || '';
      if (r.ok){
        out[r.i].ytId = self._ytId(r.url);
        out[r.i].name = r.name || items[r.i].title;
        out[r.i].artist = r.artist || items[r.i].artist;
      }
    });

    progress(total, total, '');
    return {
      tracks: out,
      lookupsUsed: data.lookups_used || 0,
      lookupsLeft: data.lookups_left,
      lookupsLimit: data.lookups_limit,
      warning: data.warning || '',
      offline: data.offline || ''
    };
  },

  /** YouTube's oEmbed endpoint: no key, no API quota, and a 404 for
      anything that isn't a real, viewable video. Used by Import and
      Promote too. */
  async oembed(ytId){
    try {
      var r = await fetch('https://www.youtube.com/oembed?url=' +
        encodeURIComponent('https://www.youtube.com/watch?v=' + ytId) + '&format=json');
      if (!r.ok) return null;
      var d = await r.json();
      if (!d || !d.title) return null;
      return { name: d.title, artist: d.author_name || '' };
    } catch(e){ return null; }
  },

  /* ── saving ──────────────────────────────────────────────────────────
     An AI playlist becomes an ordinary riffrolled playlist — same table
     Random Mix and channel imports write to — so it plays, reorders,
     exports and gets promoted like anything else. What makes it an AI
     playlist is provenance stored alongside it:
       · on the playlist row: source, the request, the objective
       · in aiSessions: the brief, the raw reply, every parsed item, and
         what each one resolved to (including what didn't)
     All of it local. The only thing that reaches the server is the
     resolved tracks joining the shared catalogue. */
  async save(brief, parsed, resolved, rawReply){
    var picked = resolved.tracks.filter(function(t){ return t.ok && t.ytId; });
    if (!picked.length) return null;

    var base = parsed.name || (brief.request ? brief.request.slice(0, 40) : 'AI DJ set');
    var pls = await dbBoss.getPlaylists();
    var name = '🤖 ' + base, n = 2;
    while (pls.some(function(p){ return p.name === name; })) name = '🤖 ' + base + ' ' + (n++);

    var plId = await dbBoss.createPl(name);
    await db.playlists.update(plId, {
      source: 'ai',
      aiRequest: brief.request,
      aiObjective: brief.objective,
      aiAt: Date.now()
    });

    for (var i = 0; i < picked.length; i++){
      var t = picked[i];
      var tid = await dbBoss.createTrack(t.ytId, t.name);
      // fill in the artist if this track is new or didn't have one
      try {
        var row = await dbBoss.getTrack(t.ytId);
        if (row && !row.artist && t.artist) await dbBoss.updateTrackMeta(t.ytId, { artist: t.artist });
      } catch(e){}
      await dbBoss.addToPlaylist(plId, tid);
    }

    try {
      await db.aiSessions.add({
        ts: Date.now(),
        playlistId: plId,
        playlistName: name,
        request: brief.request,
        objective: brief.objective,
        asked: brief.count,
        resolvedCount: picked.length,
        items: resolved.tracks.map(function(t){
          return {
            artist: t.item.artist, title: t.item.title, why: t.item.why || '',
            ok: t.ok, via: t.via || '', reason: t.reason || '', ytId: t.ytId || ''
          };
        }),
        reply: String(rawReply || '').slice(0, 20000)
      });
    } catch(e){ /* the playlist is what matters; the record is a bonus */ }

    return { playlistId: plId, name: name, count: picked.length };
  },

  /* ── adapters: how a prompt reaches an AI and a reply comes back ──
     Only the copy/paste one exists. An automatic adapter would implement
     the same shape — run(brief) → reply text — and everything above it
     would stay exactly as it is. */
  adapters: {
    copypaste: {
      id: 'copypaste',
      label: 'Bring your own AI',
      manual: true,
      async run(){ throw new Error('copy/paste is driven by the panel'); }
    }
  },
  adapter: 'copypaste'
};

/* ── THE PANEL ───────────────────────────────────────────────────────── */

var AIDJ_SVG =
  "<svg viewBox='0 0 24 24' aria-hidden='true'>" +
    "<defs><linearGradient id='adg' x1='0' y1='0' x2='1' y2='1'>" +
      "<stop offset='0' stop-color='#ff9de2'/><stop offset='1' stop-color='#8a7bff'/></linearGradient></defs>" +
    "<rect x='3.5' y='7.5' width='17' height='12' rx='4' fill='none' stroke='url(#adg)' stroke-width='1.8'/>" +
    "<circle cx='9' cy='13.5' r='1.6' fill='url(#adg)'/><circle cx='15' cy='13.5' r='1.6' fill='url(#adg)'/>" +
    "<path d='M12 7.5V4.2' fill='none' stroke='url(#adg)' stroke-width='1.8' stroke-linecap='round'/>" +
    "<circle cx='12' cy='3' r='1.3' fill='url(#adg)'/>" +
    "<path d='M3.5 11.5h-1.3M21.8 11.5h-1.3' stroke='url(#adg)' stroke-width='1.8' stroke-linecap='round'/>" +
  "</svg>";

var aiDjBoss = {

  setup(){
    var objs = Object.keys(aiDj.OBJECTIVES).map(function(k){
      var o = aiDj.OBJECTIVES[k];
      return "<button class='dj-obj" + (k === 'mixed' ? ' active' : '') + "' data-o='" + k +
        "' title='" + escapeHtml(o.hint) + "'>" + escapeHtml(o.label) + "</button>";
    }).join('');

    var main =
      "<div class='sec dj-top'>" +
        "<div class='dj-tag'>Riffrolled supplies the music.<br><b>Your AI supplies the taste.</b></div>" +
        "<textarea class='dj-req' rows='2' placeholder='Dark electronic for a late-night drive…'></textarea>" +
        "<div class='dj-objs'>" + objs + "</div>" +
        "<div class='row dj-countrow'>" +
          "<span class='dj-lbl'>Tracks</span>" +
          "<select class='dj-count'>" +
            "<option>10</option><option selected>15</option><option>20</option><option>30</option>" +
          "</select>" +
          "<button class='dj-copy' title='Copy the prompt for your AI'>⧉ Copy the prompt</button>" +
        "</div>" +
        "<div class='status-bar dj-status'></div>" +
      "</div>" +

      "<div class='sec dj-step dj-step2'>" +
        "<div class='sec-head'>Then</div>" +
        "<div class='dj-say'>Paste it into ChatGPT, Claude, Gemini — whichever you already have open. " +
          "No key, no account, no subscription: riffrolled never sees your AI.</div>" +
      "</div>" +

      "<div class='sec dj-step dj-step3'>" +
        "<div class='sec-head'>Then paste what it said back</div>" +
        "<textarea class='dj-reply' rows='4' placeholder='Paste your AI&#39;s whole reply here…'></textarea>" +
        "<div class='row dj-gorow'>" +
          "<span class='dj-parsed'></span>" +
          "<button class='dj-go'>▶ Build the playlist</button>" +
        "</div>" +
        "<div class='dj-results'></div>" +
        "<div class='status-bar dj-bstatus'></div>" +
      "</div>" +

      "<div class='sec dj-sessions-sec'>" +
        "<div class='sec-head'>Recent AI DJ sets</div>" +
        "<div class='dj-sessions'></div>" +
      "</div>";

    this.el = menuB.createMenu(AIDJ_SVG.replace(/adg/g, 'adgT') + ' AI DJ', main);
    menuB.place(this.el, { right:'800px', top:'120px', width:'330px', height:'560px' });
    this.bind();
    this.renderSessions();
  },

  bind(){
    var self = this, root = this.el;

    root.querySelector('.dj-objs').addEventListener('click', function(e){
      var b = e.target.closest('.dj-obj'); if (!b) return;
      root.querySelectorAll('.dj-obj').forEach(function(x){ x.classList.toggle('active', x === b); });
      aiDj._objective = b.dataset.o;
      self.status(aiDj.OBJECTIVES[b.dataset.o].hint);
    });

    root.querySelector('.dj-copy').onclick = function(){ self.copyPrompt(); };
    root.querySelector('.dj-go').onclick = function(){ self.build(); };

    var reply = root.querySelector('.dj-reply');
    reply.addEventListener('input', function(){
      var n = aiDj.parseReply(reply.value).items.length;
      root.querySelector('.dj-parsed').textContent = n ? (n + ' track' + (n > 1 ? 's' : '') + ' read') : '';
    });

    root.querySelector('.dj-sessions').addEventListener('click', async function(e){
      var row = e.target.closest('.dj-session'); if (!row) return;
      var pl = await db.playlists.get(Number(row.dataset.pl));
      if (!pl){ self.status('That playlist has been deleted', 'err'); return; }
      await plBoss.setActivePlaylist(pl.id);
      if (window.dock) dock.openPanel(plBoss.currentEl);
      self.status('Opened “' + pl.name + '”', 'ok');
    });
  },

  current(){
    var root = this.el;
    aiDj._request = (root.querySelector('.dj-req').value || '').trim();
    aiDj._count = parseInt(root.querySelector('.dj-count').value, 10) || 15;
    return aiDj.brief();
  },

  status(msg, kind){
    var el = this.el.querySelector('.dj-status');
    el.textContent = msg || '';
    el.className = 'status-bar dj-status' + (kind ? ' ' + kind : '');
    var self = this;
    if (msg && kind === 'ok'){ clearTimeout(this._st); this._st = setTimeout(function(){ if (el.textContent === msg) self.status(''); }, 6000); }
  },

  bstatus(msg, kind){
    var el = this.el.querySelector('.dj-bstatus');
    el.textContent = msg || '';
    el.className = 'status-bar dj-bstatus' + (kind ? ' ' + kind : '');
  },

  async copyPrompt(){
    var brief = this.current();
    var btn = this.el.querySelector('.dj-copy');
    btn.disabled = true;
    try {
      var text = await aiDj.buildPrompt(brief);
      this._prompt = text;
      try {
        await navigator.clipboard.writeText(text);
        this.status('Prompt copied — paste it into your AI ✓', 'ok');
      } catch(e){
        // clipboard blocked (http, old browser, permission): show it instead
        this.showPromptFallback(text);
        this.status('Select the text below and copy it', null);
      }
      this.el.querySelector('.dj-step3').classList.add('ready');
    } catch(e){
      this.status('Could not build the prompt: ' + e.message, 'err');
    } finally { btn.disabled = false; }
  },

  showPromptFallback(text){
    var sec = this.el.querySelector('.dj-top');
    var box = sec.querySelector('.dj-promptbox');
    if (!box){
      box = document.createElement('textarea');
      box.className = 'dj-promptbox';
      box.rows = 6;
      sec.appendChild(box);
    }
    box.value = text;
    box.select();
  },

  /* parse → resolve → save → play */
  async build(){
    var root = this.el, self = this;
    var brief = this.current();
    var raw = root.querySelector('.dj-reply').value;
    var parsed = aiDj.parseReply(raw);

    if (!parsed.items.length){
      this.bstatus('Could not read a playlist in that. Paste the whole reply, or ask your AI for the RIFFROLLED-PLAYLIST block again.', 'err');
      return;
    }

    var go = root.querySelector('.dj-go');
    go.disabled = true;
    root.querySelector('.dj-results').innerHTML = '';
    this.bstatus('Checking ' + parsed.items.length + ' tracks…');

    try {
      var resolved = await aiDj.resolve(parsed.items, {
        onProgress: function(done, total, label){
          self.bstatus('Checking ' + done + '/' + total + (label ? ' · ' + label : '') + '…');
        }
      });

      this.renderResults(parsed, resolved);

      var saved = await aiDj.save(brief, parsed, resolved, raw);
      if (!saved){
        this.bstatus('Nothing could be resolved to a real video — try again, or ask for better-known tracks.', 'err');
        go.disabled = false;
        return;
      }

      // setActivePlaylist kicks off renderTracks but doesn't wait for it,
      // and plBoss.queue is only filled when that finishes — so await the
      // render before trying to play, or the set starts silent
      await plBoss.setActivePlaylist(saved.playlistId);
      await plBoss.renderTracks();
      plBoss.renderPlaylists();
      if (window.searchBoss) searchBoss.render();
      this.renderSessions();

      var bits = ['Saved “' + saved.name + '” · ' + saved.count + ' of ' + parsed.items.length + ' tracks'];
      if (resolved.lookupsLeft != null && resolved.lookupsUsed){
        bits.push(resolved.lookupsUsed + ' YouTube lookup' + (resolved.lookupsUsed > 1 ? 's' : '') +
                  ' used · ' + resolved.lookupsLeft + ' left today');
      }
      if (resolved.warning === 'quota') bits.push('YouTube quota is spent for today — the rest came from the catalogue');
      if (resolved.offline) bits.push('offline: only verified links could be used');
      this.bstatus(bits.join(' · '), 'ok');

      // and play it — this is a DJ, after all
      if (plBoss.queue.length) plBoss.playIndex(0);
      root.querySelector('.dj-reply').value = '';
      root.querySelector('.dj-parsed').textContent = '';
    } catch(e){
      this.bstatus('Build failed: ' + e.message, 'err');
    } finally {
      go.disabled = false;
    }
  },

  renderResults(parsed, resolved){
    var box = this.el.querySelector('.dj-results');
    var VIA = {
      link: ['✓', 'from the AI’s link'],
      catalogue: ['✓', 'from the riffrolled catalogue'],
      youtube: ['✓', 'found on YouTube']
    };
    var WHY = {
      no_match: 'nothing close enough on YouTube',
      budget: 'today’s YouTube lookups are spent',
      quota: 'YouTube quota exhausted',
      rate_limit: 'YouTube is rate limiting — try again shortly',
      not_searched: 'not looked up',
      offline: 'riffrolled is offline',
      empty: 'no artist or title'
    };
    box.innerHTML = resolved.tracks.map(function(t){
      var v = VIA[t.via] || ['✗', WHY[t.reason] || 'not found'];
      var label = t.ok ? (t.artist ? t.artist + ' — ' + t.name : t.name)
                       : ((t.item.artist ? t.item.artist + ' — ' : '') + t.item.title);
      return "<div class='dj-res " + (t.ok ? 'ok' : 'bad') + "'" + (t.ytId ? " data-yt='" + escapeHtml(t.ytId) + "'" : '') + ">"
        + "<span class='dj-res-mark'>" + v[0] + "</span>"
        + "<span class='dj-res-name'>" + escapeHtml(label) + "</span>"
        + "<span class='dj-res-via'>" + escapeHtml(v[1]) + "</span>"
        + "</div>";
    }).join('');
  },

  async renderSessions(){
    var box = this.el.querySelector('.dj-sessions');
    if (!box) return;
    try {
      var rows = await db.aiSessions.orderBy('ts').reverse().limit(6).toArray();
      if (!rows.length){
        box.innerHTML = "<div class='empty'>No sets yet. Tell the DJ what you want above.</div>";
        return;
      }
      box.innerHTML = rows.map(function(s){
        var when = new Date(s.ts);
        var ago = (function(){
          var sec = Math.max(0, (Date.now() - when.getTime()) / 1000);
          if (sec < 90) return 'just now';
          if (sec < 5400) return Math.round(sec / 60) + 'm ago';
          if (sec < 172800) return Math.round(sec / 3600) + 'h ago';
          return Math.round(sec / 86400) + 'd ago';
        })();
        return "<div class='dj-session' data-pl='" + s.playlistId + "' title='Open this playlist'>"
          + "<span class='dj-sess-req'>" + escapeHtml(s.request || s.playlistName || 'AI DJ set') + "</span>"
          + "<span class='dj-sess-meta'>" + s.resolvedCount + " tracks · " + ago + "</span>"
          + "</div>";
      }).join('');
    } catch(e){
      box.innerHTML = "<div class='empty'>Couldn’t load recent sets</div>";
    }
  }
};
