/* riffrolled — dj-menu.js
   The DJ AI menu: the control panel where a brief gets built, and the
   small History panel that remembers the ones you built before.

   The menu is rendered from data (djAi.cats), not from markup, so a
   category the user invents behaves exactly like a built-in one — same
   picker, same dice, same place in the Riff Roll.

   Layout, top to bottom:
     · three mode tiles — TEXT is live, the other two are marked coming soon
     · 🎲 RIFF ROLL and 🌀 CHAOS — the whole brief in one throw
     · one collapsible section per category, each with its own 🎲
     · familiarity slider · time and length · DJ KNOWS
     · the assembled brief, and COPY DJ BRIEF
     · paste the AI's answer back and IMPORT

   Tracks and playlists deliberately do not appear here. An imported set
   goes straight to the Playlist panel, where playlists live. */

var DJAI_SVG =
  "<svg viewBox='0 0 24 24' aria-hidden='true'>" +
    "<defs><linearGradient id='adg' x1='0' y1='0' x2='1' y2='1'>" +
      "<stop offset='0' stop-color='#ff9de2'/><stop offset='1' stop-color='#8a7bff'/></linearGradient></defs>" +
    "<rect x='3.5' y='7.5' width='17' height='12' rx='4' fill='none' stroke='url(#adg)' stroke-width='1.8'/>" +
    "<circle cx='9' cy='13.5' r='1.6' fill='url(#adg)'/><circle cx='15' cy='13.5' r='1.6' fill='url(#adg)'/>" +
    "<path d='M12 7.5V4.2' fill='none' stroke='url(#adg)' stroke-width='1.8' stroke-linecap='round'/>" +
    "<circle cx='12' cy='3' r='1.3' fill='url(#adg)'/>" +
    "<path d='M3.5 11.5h-1.3M21.8 11.5h-1.3' stroke='url(#adg)' stroke-width='1.8' stroke-linecap='round'/>" +
  "</svg>";

/* mode tiles: a clipboard, a plug, a record — drawn rather than emoji so
   they sit properly next to each other at any size */
var DJ_MODE_ICONS = {
  text:
    "<svg viewBox='0 0 24 24' aria-hidden='true'><rect x='5' y='3.5' width='14' height='17' rx='2.6' fill='none' stroke='currentColor' stroke-width='1.7'/>" +
    "<rect x='9' y='1.8' width='6' height='3.4' rx='1.2' fill='currentColor'/>" +
    "<path d='M8.5 10h7M8.5 13.5h7M8.5 17h4' stroke='currentColor' stroke-width='1.5' stroke-linecap='round'/></svg>",
  byoai:
    "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M9 2.5v5M15 2.5v5' stroke='currentColor' stroke-width='1.7' stroke-linecap='round'/>" +
    "<rect x='6' y='7.5' width='12' height='7' rx='2.2' fill='none' stroke='currentColor' stroke-width='1.7'/>" +
    "<path d='M12 14.5v3.2a3.4 3.4 0 0 0 3.4 3.4' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round'/></svg>",
  riffroll:
    "<svg viewBox='0 0 24 24' aria-hidden='true'><circle cx='12' cy='12' r='8.6' fill='none' stroke='currentColor' stroke-width='1.7'/>" +
    "<circle cx='12' cy='12' r='3.1' fill='none' stroke='currentColor' stroke-width='1.5'/>" +
    "<circle cx='12' cy='12' r='1.1' fill='currentColor'/>" +
    "<path d='M12 3.4a8.6 8.6 0 0 1 8.3 6.3' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' fill='none'/></svg>"
};

var djMenuBoss = {

  open: {},            // which sections are expanded

  async setup(){
    var main =
      "<div class='dj-modes'></div>" +

      "<div class='sec dj-rollbar'>" +
        "<button class='dj-rollall' title='Roll the whole brief'>🎲 RIFF ROLL</button>" +
        "<label class='dj-chaos' title='Deliberately collide the choices — the brief tells the DJ it was on purpose'>" +
          "<input type='checkbox' class='dj-chaos-cb'><span class='spin-track'><span class='spin-thumb'></span></span>" +
          "<span class='spin-label'>🌀 Chaos</span>" +
        "</label>" +
      "</div>" +

      "<div class='dj-sections'></div>" +

      "<div class='sec dj-more'>" +
        "<button class='dj-more-btn'>＋ More settings</button>" +
        "<div class='dj-more-list'></div>" +
      "</div>" +

      "<div class='sec dj-knows'>" +
        "<div class='dj-sec-head dj-knows-head'>" +
          "<span class='dj-caret'>▸</span><span class='dj-sec-label'>DJ knows</span>" +
          "<span class='dj-knows-state'></span>" +
        "</div>" +
        "<div class='dj-knows-body'>" +
          "<label class='dj-share'>" +
            "<input type='checkbox' class='dj-share-cb'><span class='spin-track'><span class='spin-thumb'></span></span>" +
            "<span class='spin-label'>Share my listening with the DJ</span>" +
          "</label>" +
          "<div class='dj-knows-what'></div>" +
        "</div>" +
      "</div>" +

      "<div class='sec dj-brief-sec'>" +
        "<div class='sec-head'>DJ brief</div>" +
        "<div class='dj-brief'></div>" +
        "<div class='row dj-copyrow'>" +
          "<span class='dj-copy-note'></span>" +
          "<button class='dj-copy'>⧉ COPY DJ BRIEF</button>" +
        "</div>" +
        "<div class='status-bar dj-status'></div>" +
      "</div>" +

      "<div class='sec dj-import-sec'>" +
        "<div class='sec-head'>Import DJ playlist</div>" +
        "<textarea class='dj-reply' rows='4' placeholder='Paste AI response here…'></textarea>" +
        "<div class='row dj-gorow'>" +
          "<span class='dj-parsed'></span>" +
          "<button class='dj-go'>▶ IMPORT PLAYLIST</button>" +
        "</div>" +
        "<div class='status-bar dj-bstatus'></div>" +
      "</div>";

    this.el = menuB.createMenu(DJAI_SVG.replace(/adg/g, 'adgT') + ' DJ AI', main);
    menuB.place(this.el, { right:'800px', top:'80px', width:'360px', height:'640px' });

    await djAi.load();
    this.renderModes();
    this.renderSections();
    this.bind();
    this.sync();
  },

  /* ── modes ── */
  renderModes(){
    var box = this.el.querySelector('.dj-modes');
    box.innerHTML = djAi.modes.map(function(m){
      var live = m.state === 'ACTIVE';
      return "<button class='dj-mode" + (live ? ' live' : ' soon') + "' data-m='" + m.id + "'" +
        (live ? '' : " disabled") + " title='" + escapeHtml(m.blurb) + "'>" +
        "<span class='dj-mode-ico'>" + (DJ_MODE_ICONS[m.id] || '') + "</span>" +
        "<span class='dj-mode-label'>" + escapeHtml(m.label) + "</span>" +
        "<span class='dj-mode-sub'>" + escapeHtml(m.sub) + "</span>" +
        "<span class='dj-mode-state'>" + escapeHtml(m.state) + "</span>" +
      "</button>";
    }).join('');
  },

  /* ── one section per enabled category ── */
  renderSections(){
    var self = this;
    var box = this.el.querySelector('.dj-sections');
    var html = djAi.cats.filter(function(c){ return c.enabled; }).map(function(c){
      var picked = djAi.picked(c.key);
      var openNow = !!self.open[c.key];
      return "<div class='dj-section" + (openNow ? ' open' : '') + "' data-k='" + escapeHtml(c.key) + "'>" +
        "<div class='dj-sec-head'>" +
          "<span class='dj-caret'>" + (openNow ? '▾' : '▸') + "</span>" +
          "<span class='dj-sec-ico'>" + escapeHtml(c.icon || '🎚') + "</span>" +
          "<span class='dj-sec-label'>" + escapeHtml(c.label) + "</span>" +
          "<span class='dj-sec-value'>" + escapeHtml(picked ? picked.label : '—') + "</span>" +
          "<button class='dj-dice' title='Roll just this one'>🎲</button>" +
        "</div>" +
        "<div class='dj-sec-body'>" +
          (c.note ? "<div class='dj-note'>" + escapeHtml(c.note) + "</div>" : '') +
          "<input type='text' class='dj-search' placeholder='Search…'>" +
          "<div class='dj-opts'></div>" +
          "<div class='row dj-addrow'>" +
            "<input type='text' class='dj-newopt' placeholder='Add your own…'>" +
            "<button class='icon-btn dj-addopt' title='Add this option'>＋</button>" +
          "</div>" +
        "</div>" +
      "</div>";
    }).join('');

    // the fixed controls live at the end of the same list so they scroll together
    html +=
      "<div class='dj-section dj-fixed'>" +
        "<div class='dj-sec-head dj-fam-head'>" +
          "<span class='dj-sec-ico'>🧭</span>" +
          "<span class='dj-sec-label'>Familiarity</span>" +
          "<span class='dj-sec-value dj-fam-value'></span>" +
          "<button class='dj-dice dj-fam-dice' title='Roll familiarity'>🎲</button>" +
        "</div>" +
        "<div class='dj-fam-body'>" +
          "<input type='range' class='dj-fam' min='0' max='100' step='10'>" +
          "<div class='dj-fam-ends'><span>DISCOVERY</span><span>FAMILIAR</span></div>" +
        "</div>" +
      "</div>" +
      "<div class='dj-section dj-fixed'>" +
        "<div class='dj-sec-head dj-time-head'>" +
          "<span class='dj-sec-ico'>⏱</span>" +
          "<span class='dj-sec-label'>Length</span>" +
          "<span class='dj-sec-value dj-time-value'></span>" +
        "</div>" +
        "<div class='dj-time-body'>" +
          "<div class='row dj-timerow'>" +
            "<span class='dj-lbl'>Tracks</span>" +
            "<input type='number' class='dj-count' min='1' max='50' step='1'>" +
            "<span class='dj-lbl'>Minutes</span>" +
            "<input type='number' class='dj-minutes' min='5' max='600' step='5'>" +
          "</div>" +
          "<div class='row dj-timerow'>" +
            "<span class='dj-lbl'>Max per track</span>" +
            "<input type='number' class='dj-maxtrack' min='2' max='60' step='1'>" +
            "<span class='dj-avg'></span>" +
          "</div>" +
        "</div>" +
      "</div>";

    box.innerHTML = html;
    djAi.cats.filter(function(c){ return c.enabled; }).forEach(function(c){
      if (self.open[c.key]) self.renderOptions(c.key);
    });
    this.renderMore();
    // the slider and the number fields are rebuilt with the list, so they
    // have to be refilled from the state or they come back empty
    this.sync();
  },

  /** the option list inside one open section */
  renderOptions(key){
    var cat = djAi.cat(key);
    var sec = this.el.querySelector(".dj-section[data-k='" + key + "']");
    if (!cat || !sec) return;
    var box = sec.querySelector('.dj-opts');
    var q = (sec.querySelector('.dj-search').value || '').trim().toLowerCase();
    var pickedId = djAi.state.picks[key];

    var opts = (cat.options || []).filter(function(o){ return !o.hidden; });
    if (q) opts = opts.filter(function(o){
      return o.label.toLowerCase().indexOf(q) >= 0 ||
             (o.tags || []).some(function(t){ return t.indexOf(q) >= 0; });
    });
    // favourites first, then what gets used, then the rest alphabetically
    opts.sort(function(a, b){
      return (b.favourite || 0) - (a.favourite || 0)
          || (b.useCount || 0) - (a.useCount || 0)
          || a.label.localeCompare(b.label);
    });

    if (!opts.length){ box.innerHTML = "<div class='empty'>No matches</div>"; return; }
    box.innerHTML = opts.map(function(o){
      return "<div class='dj-opt" + (o.id === pickedId ? ' on' : '') + "' data-id='" + o.id + "'>" +
        "<button class='dj-fav" + (o.favourite ? ' on' : '') + "' title='Favourite'>" + (o.favourite ? '★' : '☆') + "</button>" +
        "<span class='dj-opt-label'>" + escapeHtml(o.label) + "</span>" +
        (o.tags && o.tags.length ? "<span class='dj-opt-tags'>" + escapeHtml(o.tags.slice(0, 3).join(' · ')) + "</span>" : '') +
        "<button class='dj-opt-x' title='" + (o.builtin ? 'Hide this one' : 'Delete') + "'>✕</button>" +
      "</div>";
    }).join('');
  },

  /** the switched-off categories, plus "add your own section" */
  renderMore(){
    var box = this.el.querySelector('.dj-more-list');
    if (!box) return;
    var off = djAi.cats.filter(function(c){ return !c.enabled; });
    box.innerHTML = off.map(function(c){
      return "<button class='dj-more-cat' data-id='" + c.id + "'>" + escapeHtml(c.icon || '🎚') + ' ' + escapeHtml(c.label) + "</button>";
    }).join('') +
      "<div class='row dj-addcat'>" +
        "<input type='text' class='dj-newcat' placeholder='New section name…'>" +
        "<button class='icon-btn dj-addcat-go' title='Add section'>＋</button>" +
      "</div>";
  },

  /* ── events (delegated, so re-rendering never loses them) ── */
  bind(){
    var self = this, root = this.el;

    root.querySelector('.dj-rollall').onclick = async function(){
      await djAi.rollAll({ chaos: djAi.state.chaos });
      self.renderSections();
      self.sync();
      self.status(djAi.state.chaos ? 'Chaos rolled — good luck' : 'Rolled', 'ok');
    };

    root.querySelector('.dj-chaos-cb').onchange = async function(){
      djAi.state.chaos = this.checked;
      await djAi.save();
      self.sync();
    };

    root.querySelector('.dj-sections').addEventListener('click', async function(e){
      var sec = e.target.closest('.dj-section');
      if (!sec) return;
      var key = sec.dataset.k;

      if (e.target.closest('.dj-fam-dice')){
        var steps = [0, 10, 20, 30, 50, 70, 90, 100];
        djAi.state.familiarity = steps[Math.floor(Math.random() * steps.length)];
        await djAi.save(); self.sync(); return;
      }
      if (e.target.closest('.dj-dice') && key){
        var rolled = await djAi.roll(key);
        self.renderSections(); self.sync();
        if (rolled) self.status(djAi.cat(key).label + ' → ' + rolled.label, 'ok');
        return;
      }
      if (e.target.closest('.dj-sec-head') && key){
        self.open[key] = !self.open[key];
        self.renderSections();
        if (self.open[key]) self.renderOptions(key);
        return;
      }
      if (!key) return;

      var optEl = e.target.closest('.dj-opt');
      if (optEl){
        var id = Number(optEl.dataset.id);
        if (e.target.closest('.dj-fav')){
          var o = djAi.optionById(id);
          await djAi.setFavourite(id, !(o && o.favourite));
          self.renderOptions(key);
          return;
        }
        if (e.target.closest('.dj-opt-x')){
          await djAi.removeOption(id);
          self.renderSections(); self.renderOptions(key); self.sync();
          return;
        }
        await djAi.pick(key, id);
        self.open[key] = false;
        self.renderSections(); self.sync();
        return;
      }

      if (e.target.closest('.dj-addopt')){
        var input = sec.querySelector('.dj-newopt');
        var label = (input.value || '').trim();
        if (!label) return;
        var catId = djAi.cat(key).id;
        var newId = await djAi.addOption(catId, label, self.guessTags(label));
        input.value = '';
        await djAi.pick(key, newId);
        self.renderSections(); self.renderOptions(key); self.sync();
      }
    });

    root.querySelector('.dj-sections').addEventListener('input', function(e){
      if (e.target.classList.contains('dj-search')){
        var sec = e.target.closest('.dj-section');
        if (sec) self.renderOptions(sec.dataset.k);
        return;
      }
      if (e.target.classList.contains('dj-fam')){
        djAi.state.familiarity = Number(e.target.value);
        self.sync(); djAi.save();
        return;
      }
      if (e.target.classList.contains('dj-count') || e.target.classList.contains('dj-minutes') ||
          e.target.classList.contains('dj-maxtrack')){
        djAi.state.count = Math.min(Math.max(Number(root.querySelector('.dj-count').value) || 15, 1), 50);
        djAi.state.minutes = Math.min(Math.max(Number(root.querySelector('.dj-minutes').value) || 60, 5), 600);
        djAi.state.maxTrackMin = Math.min(Math.max(Number(root.querySelector('.dj-maxtrack').value) || 8, 2), 60);
        self.sync(); djAi.save();
      }
    });

    // Enter in the "add your own" box adds it
    root.querySelector('.dj-sections').addEventListener('keydown', function(e){
      if (e.key !== 'Enter' || !e.target.classList.contains('dj-newopt')) return;
      var sec = e.target.closest('.dj-section');
      if (sec) sec.querySelector('.dj-addopt').click();
    });

    root.querySelector('.dj-more-btn').onclick = function(){
      root.querySelector('.dj-more').classList.toggle('open');
    };

    root.querySelector('.dj-more-list').addEventListener('click', async function(e){
      var cat = e.target.closest('.dj-more-cat');
      if (cat){
        await djAi.setCategoryEnabled(Number(cat.dataset.id), true);
        self.renderSections(); self.sync();
        return;
      }
      if (e.target.closest('.dj-addcat-go')){
        var input = root.querySelector('.dj-newcat');
        var label = (input.value || '').trim();
        if (!label) return;
        var key = await djAi.addCategory(label);
        input.value = '';
        self.open[key] = true;
        self.renderSections(); self.renderOptions(key); self.sync();
      }
    });

    root.querySelector('.dj-knows-head').onclick = function(){
      root.querySelector('.dj-knows').classList.toggle('open');
      self.renderKnows();
    };

    root.querySelector('.dj-share-cb').onchange = async function(){
      djAi.state.shareContext = this.checked;
      await djAi.save();
      self.renderKnows(); self.sync();
    };

    root.querySelector('.dj-copy').onclick = function(){ self.copyBrief(); };
    root.querySelector('.dj-go').onclick = function(){ self.importReply(); };

    var reply = root.querySelector('.dj-reply');
    reply.addEventListener('input', function(){
      var parsed = djAi.parseReply(reply.value);
      var n = parsed.items.length;
      var secs = djAi.totalSecs(parsed.items);
      root.querySelector('.dj-parsed').textContent = n
        ? (n + ' track' + (n > 1 ? 's' : '') + (secs ? ' · ' + djAi.fmtSecs(secs) : '') + ' read')
        : '';
    });
  },

  /** a new option still needs to join the vocabulary: borrow the tags of
      whatever else in the category shares a word with it */
  guessTags(label){
    var words = label.toLowerCase().split(/[^a-z0-9]+/).filter(function(w){ return w.length > 2; });
    var tags = {};
    djAi.cats.forEach(function(c){
      (c.options || []).forEach(function(o){
        var ol = o.label.toLowerCase();
        if (words.some(function(w){ return ol.indexOf(w) >= 0; })){
          (o.tags || []).forEach(function(t){ tags[t] = 1; });
        }
      });
    });
    return Object.keys(tags).slice(0, 4);
  },

  /* ── keep every readout in step with the state ── */
  sync(){
    var root = this.el, s = djAi.state;
    root.querySelector('.dj-chaos-cb').checked = s.chaos;
    root.classList.toggle('chaos-on', s.chaos);

    var fam = root.querySelector('.dj-fam');
    if (fam) fam.value = s.familiarity;
    var famV = root.querySelector('.dj-fam-value');
    if (famV) famV.textContent = s.familiarity + '% familiar / ' + (100 - s.familiarity) + '% discovery';

    var c = root.querySelector('.dj-count'), m = root.querySelector('.dj-minutes'), mt = root.querySelector('.dj-maxtrack');
    if (c) c.value = s.count;
    if (m) m.value = s.minutes;
    if (mt) mt.value = s.maxTrackMin;
    var tv = root.querySelector('.dj-time-value');
    if (tv) tv.textContent = s.count + ' tracks · ' + s.minutes + ' min';
    var avg = root.querySelector('.dj-avg');
    if (avg) avg.textContent = '≈ ' + djAi.avgMinutes() + ' min each';

    root.querySelector('.dj-share-cb').checked = s.shareContext;
    root.querySelector('.dj-knows-state').textContent = s.shareContext ? 'sharing' : 'private';
    root.querySelector('.dj-knows-state').className = 'dj-knows-state' + (s.shareContext ? ' on' : '');

    root.querySelector('.dj-brief').textContent = djAi.briefLine();
    var missing = djAi.cats.filter(function(x){ return x.enabled && !djAi.picked(x.key); }).length;
    root.querySelector('.dj-copy-note').textContent = missing
      ? (missing + ' section' + (missing > 1 ? 's' : '') + ' still empty — the DJ will choose')
      : '';
  },

  async renderKnows(){
    var box = this.el.querySelector('.dj-knows-what');
    if (!box || !this.el.querySelector('.dj-knows').classList.contains('open')) return;
    if (!djAi.state.shareContext){
      box.innerHTML = "<div class='dj-note'>Nothing about your listening goes into the brief. The DJ chooses blind.</div>";
      return;
    }
    var ctx = await djAi.context();
    if (!ctx.size){
      box.innerHTML = "<div class='dj-note'>Your library is empty, so there's nothing to share yet.</div>";
      return;
    }
    var rows = [
      ['Played most', ctx.top.length],
      ['Liked', ctx.liked.length],
      ['Recent', ctx.recent.length],
      ['Your tags', ctx.tags.length],
      ['Artists you already have', ctx.have.length]
    ].filter(function(r){ return r[1]; });
    box.innerHTML = "<div class='dj-note'>This goes into the brief you copy — riffrolled sends nothing itself:</div>" +
      rows.map(function(r){
        return "<div class='dj-know-row'><span>" + r[0] + "</span><span class='dj-know-n'>" + r[1] + "</span></div>";
      }).join('');
  },

  status(msg, kind){
    var el = this.el.querySelector('.dj-status');
    el.textContent = msg || '';
    el.className = 'status-bar dj-status' + (kind ? ' ' + kind : '');
    var self = this;
    if (msg && kind === 'ok'){
      clearTimeout(this._st);
      this._st = setTimeout(function(){ if (el.textContent === msg) self.status(''); }, 5000);
    }
  },

  bstatus(msg, kind){
    var el = this.el.querySelector('.dj-bstatus');
    el.textContent = msg || '';
    el.className = 'status-bar dj-bstatus' + (kind ? ' ' + kind : '');
  },

  async copyBrief(){
    var btn = this.el.querySelector('.dj-copy');
    btn.disabled = true;
    try {
      var text = await djAi.buildPrompt();
      try {
        await navigator.clipboard.writeText(text);
        this.status('Brief copied — paste it into your AI ✓', 'ok');
      } catch(e){
        var box = this.el.querySelector('.dj-promptbox') || (function(sec){
          var t = document.createElement('textarea');
          t.className = 'dj-promptbox'; t.rows = 6; sec.appendChild(t); return t;
        })(this.el.querySelector('.dj-brief-sec'));
        box.value = text; box.select();
        this.status('Select the text below and copy it');
      }
      this.el.querySelector('.dj-import-sec').classList.add('ready');
    } catch(e){
      this.status('Could not build the brief: ' + e.message, 'err');
    } finally { btn.disabled = false; }
  },

  async importReply(){
    var root = this.el, self = this;
    var raw = root.querySelector('.dj-reply').value;
    var parsed = djAi.parseReply(raw);

    if (!parsed.items.length){
      this.bstatus('Could not read a playlist in that. Paste the whole reply, or ask for the RIFFROLLED-PLAYLIST block again.', 'err');
      return;
    }
    var go = root.querySelector('.dj-go');
    go.disabled = true;
    this.bstatus('Importing ' + parsed.items.length + ' tracks…');
    try {
      var saved = await djAi.importPlaylist(parsed, raw);
      if (!saved){
        this.bstatus('No track in that reply had a YouTube link, so there is nothing to play.', 'err');
        return;
      }

      // the playlist belongs in the Playlist panel, not in here
      await plBoss.setActivePlaylist(saved.playlistId);
      await plBoss.renderTracks();
      plBoss.renderPlaylists();
      if (window.searchBoss) searchBoss.render();
      if (window.dock) dock.openPanel(plBoss.currentEl);
      if (plBoss.queue.length) plBoss.playIndex(0);

      var bits = ['Imported ' + saved.count + ' tracks'];
      if (saved.totalSecs) bits.push(djAi.fmtSecs(saved.totalSecs));
      if (saved.skipped) bits.push(saved.skipped + ' had no link and were skipped');
      bits.push('→ Playlist');
      this.bstatus(bits.join(' · '), 'ok');

      root.querySelector('.dj-reply').value = '';
      root.querySelector('.dj-parsed').textContent = '';
      if (window.djHistoryBoss) djHistoryBoss.render();
    } catch(e){
      this.bstatus('Import failed: ' + e.message, 'err');
    } finally {
      go.disabled = false;
    }
  }
};

/* ── HISTORY ───────────────────────────────────────────────────────────
   Local only, and deliberately small: what you asked for, what came back,
   and a way to reopen the playlist it became. ── */
var djHistoryBoss = {
  setup(){
    var main =
      "<div class='sec'>" +
        "<div class='sec-head'>Your DJ sets</div>" +
        "<div class='dj-hist scrollable'></div>" +
        "<div class='status-bar dj-hist-status'></div>" +
      "</div>";
    this.el = menuB.createMenu('🕘 History', main);
    menuB.place(this.el, { right:'1160px', top:'80px', width:'300px', height:'420px' });

    var self = this;
    this.el.querySelector('.dj-hist').addEventListener('click', async function(e){
      var row = e.target.closest('.dj-hist-row');
      if (!row) return;
      var id = Number(row.dataset.id);

      if (e.target.closest('.dj-hist-x')){
        await djAi.forget(id);
        self.render();
        return;
      }
      if (e.target.closest('.dj-hist-copy')){
        var s = await db.aiSessions.get(id);
        if (!s) return;
        try { await navigator.clipboard.writeText(s.reply || ''); self.status('That reply is back on your clipboard', 'ok'); }
        catch(err){ self.status('Clipboard unavailable', 'err'); }
        return;
      }
      var sess = await db.aiSessions.get(id);
      if (!sess) return;
      var pl = await db.playlists.get(sess.playlistId);
      if (!pl){ self.status('That playlist has been deleted', 'err'); return; }
      await plBoss.setActivePlaylist(pl.id);
      await plBoss.renderTracks();
      if (window.dock) dock.openPanel(plBoss.currentEl);
      self.status('Opened “' + pl.name + '”', 'ok');
    });

    this.render();
  },

  status(msg, kind){
    var el = this.el.querySelector('.dj-hist-status');
    el.textContent = msg || '';
    el.className = 'status-bar dj-hist-status' + (kind ? ' ' + kind : '');
    var self = this;
    if (msg && kind === 'ok'){
      clearTimeout(this._t);
      this._t = setTimeout(function(){ if (el.textContent === msg) self.status(''); }, 5000);
    }
  },

  async render(){
    var box = this.el.querySelector('.dj-hist');
    var rows = await djAi.history(25);
    if (!rows.length){
      box.innerHTML = "<div class='empty'>No sets yet.<br>Build a brief in DJ AI.</div>";
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
      var meta = [s.resolvedCount + ' tracks'];
      if (s.totalSecs) meta.push(djAi.fmtSecs(s.totalSecs));
      meta.push(ago);
      return "<div class='dj-hist-row' data-id='" + s.id + "' title='Open this playlist'>" +
        "<div class='dj-hist-top'>" +
          "<span class='dj-hist-name'>" + escapeHtml(s.playlistName || 'DJ set') + "</span>" +
          "<button class='dj-hist-copy' title='Copy that AI reply again'>⧉</button>" +
          "<button class='dj-hist-x' title='Forget this set'>✕</button>" +
        "</div>" +
        "<div class='dj-hist-brief'>" + escapeHtml(s.request || '') + "</div>" +
        "<div class='dj-hist-meta'>" + escapeHtml(meta.join(' · ')) + "</div>" +
      "</div>";
    }).join('');
  }
};
