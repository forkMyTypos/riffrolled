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

/* Where "copy and open" sends you. These are the chat interfaces, not the
   APIs — which is the whole point: they already have web search, they're
   already signed in, and they cost the listener nothing. riffrolled never
   sees a key because there isn't one.

   `q` names a query parameter that pre-fills the prompt, where a site has
   one. Leave it undefined and the brief goes via the clipboard instead,
   which always works. A pre-filled URL carrying the whole brief runs to
   around 4,500 characters, so anything set here needs testing against a
   real brief before it is trusted — truncation is silent, and a brief
   cut off mid-sentence produces a confident, wrong playlist. */
var DJ_SITES = [
  // Tested 2026-10-06 with a real 3,263-character brief: chatgpt.com/?q=
  // carried all of it (a sentinel on the last line arrived intact) and
  // submitted it on arrival, signed in or not. So ChatGPT is genuinely one
  // press. The brief still goes on the clipboard as well, because a browser
  // may refuse the tab and because the reply has to come back somehow.
  { key: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/', q: 'q' },
  { key: 'claude',  label: 'Claude',  url: 'https://claude.ai/new' },
  { key: 'gemini',  label: 'Gemini',  url: 'https://gemini.google.com/app' },
  // grok.com reads ?q= on load, fills the box and submits (checked 2026-10-22;
  // third-party link builders recommend keeping it under ~2,000 characters).
  // Every DJ prompt is far longer than PREFILL_MAX, so in practice Grok opens
  // plain and the brief goes by the clipboard, exactly like Claude and Gemini.
  { key: 'grok',    label: 'Grok',    url: 'https://grok.com/', q: 'q' }
];

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
  seeded:
    "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>" +
      "<circle cx='7' cy='17' r='2.4'/><path d='M9.4 17V6.5l5-1.3v9.6'/><circle cx='12' cy='14.8' r='2.4'/>" +
      "<path d='M16.5 9.5c1.6.4 3 1.6 3.8 3.3M16.5 6.4c2.5.6 4.6 2.5 5.4 5'/></svg>",
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
      "<div class='dj-submodes'></div>" +

      "<div class='sec dj-rollbar'>" +
        "<button class='dj-rollall' data-testid='dj-roll-btn' title='Roll the brief, build the prompt and copy it'>🎲 RIFF ROLL</button>" +
        "<label class='dj-chaos' title='Deliberately collide the choices — the brief tells the DJ it was on purpose'>" +
          "<input type='checkbox' class='dj-chaos-cb'><span class='spin-track'><span class='spin-thumb'></span></span>" +
          "<span class='spin-label'>🌀 Chaos</span>" +
        "</label>" +
      "</div>" +
      "<div class='dj-est'></div>" +
      "<div class='dj-used' hidden></div>" +

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
            "<span class='spin-label'>Share my most-liked tracks</span>" +
          "</label>" +
          "<div class='dj-liked-n' role='radiogroup' aria-label='How many liked tracks' data-testid='dj-liked-n'>" +
            "<span>How many:</span>" +
            "<button type='button' data-n='10'>10</button><button type='button' data-n='15'>15</button><button type='button' data-n='20'>20</button>" +
          "</div>" +
          /* Opt-in, and worded so the trade is plain before it is taken:
             what goes in the brief, who paid for it, and that the DJ is
             under no obligation to use it. Off by default — a brief is
             something you are about to hand to someone else. */
          "<label class='dj-promo-opt'>" +
            "<input type='checkbox' class='dj-promo-cb'><span class='spin-track'><span class='spin-thumb'></span></span>" +
            "<span class='spin-label'>Allow promotional tracks</span>" +
          "</label>" +
          "<div class='dj-promo-note'>" +
            "Adds up to three paid placements to the brief when they match the " +
            "moods you picked. Your AI decides whether to use them, and " +
            "riffrolled labels them as promoted wherever they turn up." +
          "</div>" +
          "<div class='dj-knows-what'></div>" +
        "</div>" +
      "</div>" +

      "<div class='sec dj-brief-sec'>" +
        "<div class='sec-head'>DJ brief</div>" +
        "<div class='dj-brief'></div>" +
        "<div class='row dj-copyrow'>" +
          "<span class='dj-copy-note'></span>" +
          "<button class='dj-copy' data-testid='dj-copy-btn' aria-label='Copy DJ brief'>⧉ COPY DJ BRIEF</button>" +
        "</div>" +
        // one press: copy the brief and open the AI. Saves nothing but the
        // trip to a bookmark — which is most of the friction in practice.
        "<div class='dj-open-row'>" +
          "<span class='dj-open-lbl'>open in</span>" +
          DJ_SITES.map(function(s){
            return "<button class='dj-open' data-k='" + s.key + "' title='Copy the brief and open " +
                   escapeHtml(s.label) + "'>" + escapeHtml(s.label) + " ↗</button>";
          }).join('') +
        "</div>" +
        "<div class='status-bar dj-status'></div>" +
      "</div>" +

      "<div class='sec dj-import-sec'>" +
        "<div class='sec-head'>Import DJ playlist</div>" +
        // Shown when you come back having copied a brief. One click reads the
        // clipboard directly (the click is the gesture that permits it), so a
        // reply never has to be found, selected and pasted into a box.
        "<button class='dj-pasteback' hidden>📋 Paste your reply</button>" +
        "<textarea class='dj-reply' data-testid='dj-reply' rows='4' placeholder='Paste AI response here…'></textarea>" +
        /* Link checking used to be a toggle. It is keyless, costs no API
           quota and takes a second — so offering it as a choice only
           invited people to turn off the thing that catches an AI handing
           back invented video ids. It just happens now. */
        "<div class='dj-check-note'>Links are checked against YouTube before importing.</div>" +
        /* Opt-in, off by default, and worded so the listener knows exactly
           what leaves the browser before they tick it. */
        "<label class='dj-community' data-testid='dj-community'>" +
          "<input type='checkbox' class='dj-community-cb' data-testid='dj-community-cb'>" +
          "<span>🌍 Share with community</span>" +
        "</label>" +
        "<div class='dj-community-note'>Adds the playlist to Mixes → Community for anyone to play: its name, tracks and your DJ choices. " +
          "Your wallet's public key is recorded so abuse can be traced — it isn't shown to anyone, and nothing else about you goes. " +
          "The first share from a new key gets a quick check by a person before it's listed.</div>" +
        "<div class='row dj-gorow'>" +
          "<span class='dj-parsed' data-testid='dj-parsed' role='status' aria-live='polite'></span>" +
          "<button class='dj-go' data-testid='dj-import-btn' aria-label='Import playlist'>▶ IMPORT PLAYLIST</button>" +
        "</div>" +
        "<div class='dj-deadlist'></div>" +
        "<div class='status-bar dj-bstatus' data-testid='dj-status' role='status' aria-live='polite'></div>" +
      "</div>";

    this.el = menuB.createMenu(DJAI_SVG.replace(/adg/g, 'adgT') + ' DJ AI', main);
    this.el.classList.add('dj-panel');          // this one menu gets a scrollbar
    /* the wizard: a pop-up card over this panel (never over the player —
       the panel itself sits below the video) for the steps after "copy" */
    var wiz = document.createElement('div');
    wiz.className = 'dj-wiz'; wiz.hidden = true;
    wiz.setAttribute('data-testid', 'dj-wiz');
    wiz.setAttribute('role', 'dialog'); wiz.setAttribute('aria-modal', 'true');
    wiz.innerHTML = "<div class='dj-wiz-card'></div>";
    this.el.appendChild(wiz);
    menuB.place(this.el, { right:'800px', top:'80px', width:'360px', height:'640px' });

    await djAi.ready();
    this.renderModes();
    this.renderSubModes();
    this.renderSections();
    this.bind();
    this.sync();
  },

  speed(){ return djAi.state.textMode === 'speed'; },

  /* which categories get a section of their own, and which wait behind
     More settings. Speed mode asks four things; everything else is still
     there, just not in the way. */
  mainCats(){
    var speed = this.speed();
    return djAi.cats.filter(function(c){
      return c.enabled && (!speed || djAi.SPEED_CORE.indexOf(c.key) >= 0);
    });
  },

  extraCats(){
    if (!this.speed()) return [];
    return djAi.cats.filter(function(c){
      return c.enabled && djAi.SPEED_CORE.indexOf(c.key) < 0;
    });
  },

  /* ── the two ways to brief ──
     One-shot (state 'speed'): one prompt, the finished playlist comes back.
     The Riffenator (state 'details', once "multi-shot"): a wizard — the DJ
     brief, the track list, then Link Hunter. It gives better mixes, and
     the panel says so. */
  renderSubModes(){
    var speed = this.speed();
    this.el.querySelector('.dj-submodes').innerHTML =
      "<button class='dj-sub" + (speed ? ' on' : '') + "' data-s='speed' data-testid='dj-oneshot' " +
        "title='One prompt: the AI picks the songs, finds the YouTube links and sends back the finished playlist'>🎯 One-shot prompt</button>" +
      "<button class='dj-sub dj-sub-riff" + (speed ? '' : ' on') + "' data-s='details' data-testid='dj-multishot' " +
        "title='Better mixes: a DJ picks the songs, then Link Hunter finds real YouTube links — guided, step by step'>" +
        "🤖🎸 The Riffenator<span class='dj-better'>BETTER</span></button>" +
      /* say it, don't just badge it: why the Riffenator is the better choice */
      "<div class='dj-sub-why' data-testid='dj-sub-why'>" + (speed
        ? "Quick, but one AI doing everything often makes up links. <b>The Riffenator</b> gets better mixes: a DJ picks the songs, then Link Hunter finds the real YouTube links."
        : "🤖🎸 <b>The Riffenator</b> — our best mixes. A DJ picks the songs first, then Link Hunter finds the real YouTube links. A pop-up walks you through it.") +
      "</div>";
  },

  /* ── modes ── */
  renderModes(){
    var box = this.el.querySelector('.dj-modes');
    var cur = djAi.state.mode || 'text';
    box.innerHTML = djAi.modes.map(function(m){
      var live = m.state === 'ACTIVE', on = live && m.id === cur;
      var badge = !live ? m.state : (on ? 'ACTIVE' : (m.id === 'seeded' ? 'NEW' : 'PICK'));
      return "<button class='dj-mode" + (live ? ' live' : ' soon') + (on ? ' on' : '') + "' data-m='" + m.id + "' data-testid='dj-mode-" + m.id + "'" +
        (live ? '' : " disabled") + " title='" + escapeHtml(m.blurb) + "' aria-pressed='" + (on ? 'true' : 'false') + "'>" +
        "<span class='dj-mode-ico'>" + (DJ_MODE_ICONS[m.id] || '') + "</span>" +
        "<span class='dj-mode-label'>" + escapeHtml(m.label) + "</span>" +
        "<span class='dj-mode-sub'>" + escapeHtml(m.sub) + "</span>" +
        "<span class='dj-mode-state" + (badge === 'NEW' ? ' new' : '') + "'>" + escapeHtml(badge) + "</span>" +
      "</button>";
    }).join('');
  },

  /* one category, as a collapsible row that shows its value when closed */
  sectionHtml(c){
    var openNow = !!this.open[c.key];
    var shown = this.speed() ? djAi.effective(c.key) : djAi.picked(c.key);
    return "<div class='dj-section" + (openNow ? ' open' : '') + "' data-k='" + escapeHtml(c.key) + "'>" +
      "<div class='dj-sec-head'>" +
        "<span class='dj-caret'>" + (openNow ? '▾' : '▸') + "</span>" +
        "<span class='dj-sec-ico'>" + escapeHtml(c.icon || '🎚') + "</span>" +
        "<span class='dj-sec-label'>" + escapeHtml(c.label) + "</span>" +
        "<span class='dj-sec-value" + (shown && shown.any ? ' any' : '') + "'>" +
          escapeHtml(shown ? shown.label : '—') + "</span>" +
        "<button class='dj-dice' title='Roll just this one'>🎲</button>" +
      "</div>" +
      "<div class='dj-sec-body'>" +
        (c.note ? "<div class='dj-note'>" + escapeHtml(c.note) + "</div>" : '') +
        (c.key === 'direction' ? "<label class='dj-stick' data-testid='dj-stick'><input type='checkbox' class='dj-stick-cb'" +
          (djAi.state.stick !== false ? ' checked' : '') + "> Stay in this genre</label>" : '') +
        "<input type='text' class='dj-search' placeholder='Search…'>" +
        "<div class='dj-opts'></div>" +
        "<div class='row dj-addrow'>" +
          "<input type='text' class='dj-newopt' placeholder='Add your own…'>" +
          "<button class='icon-btn dj-addopt' title='Add this option'>＋</button>" +
        "</div>" +
      "</div>" +
    "</div>";
  },

  famHtml(){
    return "<div class='dj-section dj-fixed'>" +
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
    "</div>";
  },

  /* Length: a single line in speed mode with a ＋ to open the numbers,
     always open in details mode where the brief is the point */
  timeHtml(){
    var speed = this.speed();
    var open = !speed || this.open._time;
    return "<div class='dj-section dj-fixed dj-timesec" + (open ? ' open' : '') + "'>" +
      "<div class='dj-sec-head dj-time-head'>" +
        "<span class='dj-sec-ico'>⏱</span>" +
        "<span class='dj-sec-label'>Length</span>" +
        "<span class='dj-sec-value dj-time-value'></span>" +
        (speed ? "<button class='dj-expand' title='Set tracks, minutes and the per-track ceiling'>" +
                 (open ? '－' : '＋') + "</button>" : '') +
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
  },

  seeded(){ return djAi.state.mode === 'seeded'; },

  /* Track Rolled Journey: the seeds ARE the brief. Up to five, added from
     what's playing, from the library, or typed / pasted. */
  seedsHtml(){
    var seeds = djAi.state.seeds || [];
    return "<div class='dj-section dj-fixed dj-seeds open' data-testid='dj-seeds'>" +
      "<div class='dj-sec-head'><span class='dj-sec-ico'>🎵</span><span class='dj-sec-label'>Seed tracks</span>" +
        "<span class='dj-sec-value'>" + seeds.length + ' of ' + djAi.SEED_MAX + "</span></div>" +
      "<div class='dj-seed-body'>" +
        "<div class='dj-note'>Pick up to five tracks you love. The DJ rolls a journey outward from them — the seeds themselves won't be in it.</div>" +
        (seeds.length ? "<ol class='dj-seed-list'>" + seeds.map(function(t, i){
          return "<li class='dj-seed' data-i='" + i + "'><span class='dj-seed-t'>" +
            escapeHtml((t.artist ? t.artist + ' — ' : '') + (t.title || t.ytId)) + "</span>" +
            "<button class='dj-seed-x' data-i='" + i + "' title='Remove' aria-label='Remove this seed'>✕</button></li>";
        }).join('') + "</ol>" : "<div class='dj-seed-empty'>No seeds yet.</div>") +
        "<div class='row dj-seed-row'>" +
          "<button class='dj-seed-now' data-testid='dj-seed-now'>＋ Now playing</button>" +
        "</div>" +
        "<div class='row dj-seed-row'>" +
          "<input type='text' class='dj-seed-in' data-testid='dj-seed-in' placeholder='Search your library, paste a YouTube link, or type Artist - Title'>" +
          "<button class='icon-btn dj-seed-add' data-testid='dj-seed-add' title='Add as a seed'>＋</button>" +
        "</div>" +
        "<div class='dj-seed-hits'></div>" +
      "</div>" +
    "</div>";
  },

  async renderSeedHits(q){
    var box = this.el.querySelector('.dj-seed-hits');
    if (!box) return;
    q = String(q || '').trim().toLowerCase();
    if (q.length < 2 || djAi._ytUrlId(q) || djAi._bareId(q)){ box.innerHTML = ''; return; }
    var rows = [];
    try {
      rows = (await db.tracks.toArray()).filter(function(t){
        return ((t.artist || '') + ' ' + (t.name || '')).toLowerCase().indexOf(q) >= 0;
      }).slice(0, 6);
    } catch(e){}
    box.innerHTML = rows.map(function(t){
      return "<button class='dj-seed-hit' data-yt='" + escapeHtml(t.ytId) + "'>" +
        escapeHtml((t.artist ? t.artist + ' — ' : '') + (t.name || t.ytId)) + "</button>";
    }).join('');
  },

  async addSeedAndRender(t){
    try { await djAi.addSeed(t); }
    catch(e){ this.status(e.message, 'err'); return false; }
    this.renderSections(); this.sync();
    this.status('Seed added', 'ok');
    return true;
  },

  /** from elsewhere (Track info): start a Track Rolled Journey from this track */
  async seedFrom(ytId){
    await djAi.ready();
    var t = null;
    try { t = await db.tracks.where('ytId').equals(ytId).first(); } catch(e){}
    djAi.state.mode = 'seeded';
    await djAi.save();
    this.renderModes(); this.renderSections();
    if (window.dock) dock.openPanel(this.el);
    await this.addSeedAndRender({ ytId: ytId, artist: t ? t.artist : '', title: t ? t.name : '' });
  },

  renderSections(){
    var self = this;
    var box = this.el.querySelector('.dj-sections');
    var seeded = this.seeded();
    this.el.classList.toggle('dj-seeded', seeded);
    var cats = seeded ? djAi.cats.filter(function(c){ return c.key === 'personality' && c.enabled; }) : this.mainCats();

    var html = seeded ? this.seedsHtml() : '';
    html += cats.map(function(c){ return self.sectionHtml(c); }).join('');
    // familiarity is a details-mode control; in speed it waits behind More
    if (!seeded && !this.speed()) html += this.famHtml();
    html += this.timeHtml();

    box.innerHTML = html;
    cats.forEach(function(c){ if (self.open[c.key]) self.renderOptions(c.key); });
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
             (o.tags || []).some(function(t){ return t.indexOf(q) >= 0; }) ||
             (o.vibe || []).some(function(t){ return t.indexOf(q) >= 0; }) ||
             String(o.blurb || '').toLowerCase().indexOf(q) >= 0;
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
        "<span class='dj-opt-label'>" + escapeHtml(o.label) +
          (o.blurb ? "<span class='dj-opt-blurb'>" + escapeHtml(o.blurb) + "</span>" : '') + "</span>" +
        // the describing words (Dan's three) where an option has them, else its mood tags
        ((o.vibe && o.vibe.length) || (o.tags && o.tags.length)
          ? "<span class='dj-opt-tags'>" + escapeHtml(((o.vibe && o.vibe.length) ? o.vibe : o.tags).slice(0, 3).join(' · ')) + "</span>" : '') +
        "<button class='dj-opt-x' title='" + (o.builtin ? 'Hide this one' : 'Delete') + "'>✕</button>" +
      "</div>";
    }).join('');
  },

  /* More settings: in speed mode this is where the rest of the details
     menu lives — everything still works, it just isn't in the way until
     you want it. Anything you set here shows up in the brief and in the
     thinking-time estimate. */
  renderMore(){
    var self = this;
    var box = this.el.querySelector('.dj-more-list');
    if (!box) return;

    var html = '';
    if (this.speed()){
      var extra = this.extraCats();
      if (extra.length) html += extra.map(function(c){ return self.sectionHtml(c); }).join('');
      html += this.famHtml();
    }
    var off = djAi.cats.filter(function(c){ return !c.enabled; });
    if (off.length){
      html += "<div class='dj-more-chips'>" + off.map(function(c){
        return "<button class='dj-more-cat' data-id='" + c.id + "'>" +
          escapeHtml(c.icon || '🎚') + ' ' + escapeHtml(c.label) + "</button>";
      }).join('') + "</div>";
    }
    html += "<div class='row dj-addcat'>" +
        "<input type='text' class='dj-newcat' placeholder='New section name…'>" +
        "<button class='icon-btn dj-addcat-go' title='Add section'>＋</button>" +
      "</div>";

    box.innerHTML = html;
    if (this.speed()) this.extraCats().forEach(function(c){
      if (self.open[c.key]) self.renderOptions(c.key);
    });
  },

  /* ── events (delegated, so re-rendering never loses them) ── */
  bind(){
    var self = this, root = this.el;

    /* The main roll is the whole point of speed mode: one press rolls the
       brief, builds the prompt, puts it on the clipboard and tells you
       what it used. The per-section dice never copy — those are for
       nudging a brief you're still working on. */
    root.querySelector('.dj-rollall').onclick = async function(){
      var btn = this;
      btn.disabled = true;
      try { await self.rollAndCopy(); }
      finally { btn.disabled = false; }
    };

    root.querySelector('.dj-chaos-cb').onchange = async function(){
      djAi.state.chaos = this.checked;
      await djAi.save();
      self.sync();
    };

    root.querySelector('.dj-modes').addEventListener('click', async function(e){
      var b = e.target.closest('.dj-mode.live');
      if (!b || djAi.state.mode === b.dataset.m) return;
      djAi.state.mode = b.dataset.m;
      await djAi.save();
      self.open = {};
      self.renderModes(); self.renderSubModes(); self.renderSections(); self.sync();
    });

    root.querySelector('.dj-sections').addEventListener('click', async function(e){
      var x = e.target.closest('.dj-seed-x');
      if (x){ await djAi.removeSeed(+x.dataset.i); self.renderSections(); self.sync(); return; }
      if (e.target.closest('.dj-seed-now')){
        var yt = window.player && player.currentYtId;
        if (!yt){ self.status('Nothing is playing — search your library below instead', 'err'); return; }
        var tr = null; try { tr = await db.tracks.where('ytId').equals(yt).first(); } catch(err){}
        await self.addSeedAndRender({ ytId: yt, artist: tr ? tr.artist : '', title: tr ? tr.name : '' });
        return;
      }
      var hit = e.target.closest('.dj-seed-hit');
      if (hit){
        var row = null; try { row = await db.tracks.where('ytId').equals(hit.dataset.yt).first(); } catch(err){}
        await self.addSeedAndRender({ ytId: hit.dataset.yt, artist: row ? row.artist : '', title: row ? row.name : '' });
        return;
      }
      if (e.target.closest('.dj-seed-add')){
        var inp = root.querySelector('.dj-seed-in');
        try { await self.addSeedAndRender(await djAi.seedFromText(inp.value)); }
        catch(err){ self.status(err.message, 'err'); }
      }
    });
    root.querySelector('.dj-sections').addEventListener('input', function(e){
      if (e.target.classList.contains('dj-seed-in')) self.renderSeedHits(e.target.value);
    });
    root.querySelector('.dj-sections').addEventListener('keydown', async function(e){
      if (e.key === 'Enter' && e.target.classList.contains('dj-seed-in')){
        e.preventDefault();
        try { await self.addSeedAndRender(await djAi.seedFromText(e.target.value)); }
        catch(err){ self.status(err.message, 'err'); }
      }
    });

    root.querySelector('.dj-submodes').addEventListener('click', async function(e){
      var b = e.target.closest('.dj-sub');
      if (!b || djAi.state.textMode === b.dataset.s) return;
      djAi.state.textMode = b.dataset.s;
      await djAi.save();
      self.open = {};                       // a fresh mode opens tidily
      self.renderSubModes();
      self.renderSections();
      self.el.querySelector('.dj-used').hidden = true;
      self.sync();
    });

    // the same section behaviour wherever a section is rendered — the main
    // list in details mode, or inside More settings in speed mode
    ['.dj-sections', '.dj-more-list'].forEach(function(sel){
      root.querySelector(sel).addEventListener('click', function(e){ self.onSectionClick(e); });
      root.querySelector(sel).addEventListener('input', function(e){ self.onSectionInput(e); });
      root.querySelector(sel).addEventListener('keydown', function(e){
        if (e.key !== 'Enter' || !e.target.classList.contains('dj-newopt')) return;
        var sec = e.target.closest('.dj-section');
        if (sec) sec.querySelector('.dj-addopt').click();
      });
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

    root.querySelector('.dj-liked-n').onclick = async function(e){
      var b = e.target.closest('button[data-n]'); if (!b) return;
      djAi.state.likedN = Number(b.dataset.n);
      await djAi.save();
      self.renderKnows(); self.sync();
    };

    root.querySelector('.dj-share-cb').onchange = async function(){
      djAi.state.shareContext = this.checked;
      await djAi.save();
      self.renderKnows(); self.sync();
    };

    root.querySelector('.dj-promo-cb').onchange = async function(){
      djAi.state.allowPromoted = this.checked;
      /* Turning it on or off changes what the brief contains, so the
         next copy is a new brief. Turning it OFF matters most: without
         this, placements offered while it was on would still be sitting
         against the old brief id and would be charged by a later copy
         that no longer contains them. */
      djAi.newBrief();
      await djAi.save();
      self.renderKnows(); self.sync();
    };

    root.querySelector('.dj-copy').onclick = function(){ self.copyBrief(); };
    root.querySelector('.dj-go').onclick = function(){ self.importReply(); };

    root.querySelector('.dj-open-row').addEventListener('click', function(e){
      var b = e.target.closest('.dj-open');
      if (b) self.openIn(b.dataset.k, b);
    });

    root.querySelector('.dj-pasteback').onclick = function(){ self.pasteBack(this); };
    root.querySelector('.dj-wiz').addEventListener('click', function(e){ self.onWiz(e); });
    root.querySelector('.dj-community-cb').onchange = async function(){
      djAi.state.shareCommunity = this.checked;
      await djAi.save();
    };

    /* Coming back to the tab is the signal that you have been to an AI.
       Both events are needed: switching tabs fires visibilitychange, while
       switching windows only fires focus. */
    var back = function(){ if (!document.hidden) self.offerPaste(); };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);

    var reply = root.querySelector('.dj-reply');
    reply.addEventListener('input', function(){
      if (djAi.isDraft(reply.value)){
        var dr = djAi.readDraft(reply.value);
        var pe = root.querySelector('.dj-parsed');
        pe.className = 'dj-parsed';
        pe.textContent = dr.tracks.length ? 'A track list: ' + dr.tracks.length + ' tracks, no links yet — press Import to hunt them' : '';
        return;
      }
      var parsed = djAi.parseReply(reply.value);
      var n = parsed.items.length;
      var secs = djAi.totalSecs(parsed.items);
      var el = root.querySelector('.dj-parsed');
      if (!n){ el.textContent = ''; el.className = 'dj-parsed'; return; }

      var txt = n + ' track' + (n > 1 ? 's' : '') + (secs ? ' · ' + djAi.fmtSecs(secs) : '') + ' read';
      /* "1 track read" from a reply holding twelve links is a different
         problem from an AI that only sent one, and they used to look
         identical. Say which it is, before the import rather than after. */
      var missed = (parsed.linksSeen || 0) - parsed.items.filter(function(i){ return i.url; }).length;
      if (missed > 0){
        txt += ' — but there are ' + parsed.linksSeen + ' links in that. '
          + 'Try copying from the AI’s code block rather than the page.';
        el.className = 'dj-parsed warn';
      } else {
        el.className = 'dj-parsed';
      }
      el.textContent = txt;
    });
  },

  /* The tracks whose links turned out not to exist. Named, because the
     music is usually right and it is only the link that was invented —
     and offered back to the AI as a short follow-up rather than making
     the listener write one. */
  renderDead(dead, odd, total, rep){
    var box = this.el.querySelector('.dj-deadlist');
    var html = '';

    /* Tracks the AI gave that riffrolled cannot play, named rather than
       counted. A set of fifteen that lands as four needs to say which
       eleven went and why — the three reasons below are different
       failures and a listener can act on each of them differently. */
    if (rep && rep.noLink.length){
      html += "<div class='dj-dead-head'>" + rep.noLink.length + " of " + total +
        " had no YouTube link and riffrolled couldn’t find one</div>" +
        rep.noLink.slice(0, 8).map(function(it){
          return "<div class='dj-dead-row'>" +
            escapeHtml((it.artist ? it.artist + ' — ' : '') + it.title) + "</div>";
        }).join('') +
        (rep.noLink.length > 8 ? "<div class='dj-dead-row'>…and " + (rep.noLink.length - 8) + " more</div>" : '');
    }

    /* The quietest failure of the three. An AI that cannot find a link
       sometimes repeats one it already used, so three different songs
       arrive pointing at one video. riffrolled keeps the first and drops
       the rest — silently, until now. */
    if (rep && rep.repeated.length){
      html += "<div class='dj-odd-head'>" + rep.repeated.length +
        " reuse a link already used for another track</div>" +
        rep.repeated.map(function(it){
          return "<div class='dj-dead-row'>" +
            escapeHtml((it.artist ? it.artist + ' — ' : '') + it.title) +
            " <span class='dj-odd-actual'>→ same video as " + escapeHtml(it.repeatOf) + "</span></div>";
        }).join('');
    }

    if (dead.length){
      html += "<div class='dj-dead-head'>" + dead.length + " of " + total +
        " links point at videos that don't exist</div>" +
        dead.map(function(it){
          return "<div class='dj-dead-row'>" +
            escapeHtml((it.artist ? it.artist + ' — ' : '') + it.title) + "</div>";
        }).join('');
    }

    // a live link to the wrong song is the quieter failure: it plays, so
    // nothing looks broken until you listen
    if (odd && odd.length){
      html += "<div class='dj-odd-head'>" + odd.length +
        " link" + (odd.length > 1 ? 's' : '') + " may play something else</div>" +
        odd.map(function(it){
          return "<div class='dj-dead-row'>" + escapeHtml(it.title) +
            " <span class='dj-odd-actual'>→ " + escapeHtml(it.mismatch) + "</span></div>";
        }).join('');
    }

    /* A follow-up is worth offering for any of the three failures, not
       just dead links — a reply full of Bandcamp urls is the AI ignoring
       the brief, and it can fix that if it is told. */
    // the "still missing" pop-up (Link Hunter for just these tracks) replaced
    // the old "copy a note asking your AI to fix these" button
    var fixable = false;
    box.innerHTML = html;
    if (!fixable) return;

    var self = this;
    box.querySelector('.dj-fix').onclick = async function(){
      var text = djAi.buildFixPrompt(dead, rep);
      try {
        await navigator.clipboard.writeText(text);
        if (window.appToast) appToast('Follow-up copied — paste it to your AI', 'ok');
      } catch(e){
        if (window.appToast) appToast('Clipboard blocked', 'warn');
      }
    };
  },

  /** what the roll settled on, shown so you know what you just copied */
  showUsed(copied){
    var box = this.el.querySelector('.dj-used');
    var self = this;
    var bits = djAi.cats.filter(function(c){ return c.enabled; }).map(function(c){
      var o = self.speed() ? djAi.effective(c.key) : djAi.picked(c.key);
      return o && !o.any ? "<span class='dj-used-bit'>" + escapeHtml(o.label) + "</span>" : '';
    }).filter(Boolean).join('');
    box.innerHTML =
      "<div class='dj-used-head'>" + (copied ? '✓ Prompt copied · ' : '') +
        djAi.state.count + " tracks · " + djAi.estimateLabel() + " of DJ time</div>" +
      "<div class='dj-used-bits'>" + (bits || "<span class='dj-used-bit'>the DJ's choice throughout</span>") + "</div>";
    box.hidden = false;
  },

  /* one handler for every section, wherever it is rendered */
  onSectionClick: async function(e){
    var self = this;
    var sec = e.target.closest('.dj-section');
    if (!sec) return;
    var key = sec.dataset.k;
    var stick = e.target.closest('.dj-stick-cb');
    if (stick){ djAi.state.stick = stick.checked; await djAi.save(); this.sync(); return; }
    if (e.target.closest('.dj-stick')) return;     // the label passes its click to the box

    if (e.target.closest('.dj-fam-dice')){
      var steps = [0, 10, 20, 30, 50, 70, 90, 100];
      djAi.state.familiarity = steps[Math.floor(Math.random() * steps.length)];
      await djAi.save(); this.sync(); return;
    }
    if (e.target.closest('.dj-expand')){            // speed mode: open the numbers
      this.open._time = !this.open._time;
      this.renderSections(); return;
    }
    /* The whole Length row opens it too, not just the ＋. Every other
       section head in this panel toggles when you click it, so a row
       that looks identical and only responds to a 16px button is a trap
       — the browser test tripped over it before a person had to. The ＋
       stays as the affordance; this just widens the target to the row.
       Details mode renders Length permanently open, hence the guard. */
    if (e.target.closest('.dj-time-head') && this.speed()){
      this.open._time = !this.open._time;
      this.renderSections(); return;
    }
    // a single-section roll never copies — it is for nudging a brief you
    // are still building. Only the main RIFF ROLL hands you a prompt.
    if (e.target.closest('.dj-dice') && key){
      var rolled = await djAi.roll(key);
      this.renderSections(); this.sync();
      if (rolled) this.status(djAi.cat(key).label + ' → ' + rolled.label, 'ok');
      return;
    }
    if (e.target.closest('.dj-sec-head') && key){
      this.open[key] = !this.open[key];
      this.renderSections();
      if (this.open[key]) this.renderOptions(key);
      return;
    }
    if (!key) return;

    var optEl = e.target.closest('.dj-opt');
    if (optEl){
      var id = Number(optEl.dataset.id);
      if (e.target.closest('.dj-fav')){
        var o = djAi.optionById(id);
        await djAi.setFavourite(id, !(o && o.favourite));
        this.renderOptions(key);
        return;
      }
      if (e.target.closest('.dj-opt-x')){
        await djAi.removeOption(id);
        this.renderSections(); this.renderOptions(key); this.sync();
        return;
      }
      // choosing "don't mind" means clearing the pick, not storing one
      var opt = djAi.optionById(id);
      if (opt && opt.any) await djAi.clearPick(key);
      else await djAi.pick(key, id);
      this.open[key] = false;
      this.renderSections(); this.sync();
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
      this.renderSections(); this.renderOptions(key); this.sync();
    }
  },

  onSectionInput: function(e){
    var root = this.el;
    if (e.target.classList.contains('dj-search')){
      var sec = e.target.closest('.dj-section');
      if (sec) this.renderOptions(sec.dataset.k);
      return;
    }
    if (e.target.classList.contains('dj-fam')){
      djAi.state.familiarity = Number(e.target.value);
      this.sync(); djAi.save();
      return;
    }
    if (e.target.classList.contains('dj-count') || e.target.classList.contains('dj-minutes') ||
        e.target.classList.contains('dj-maxtrack')){
      djAi.state.count = Math.min(Math.max(Number(root.querySelector('.dj-count').value) || 15, 1), 50);
      djAi.state.minutes = Math.min(Math.max(Number(root.querySelector('.dj-minutes').value) || 60, 5), 600);
      djAi.state.maxTrackMin = Math.min(Math.max(Number(root.querySelector('.dj-maxtrack').value) || 8, 2), 60);
      this.sync(); djAi.save();
    }
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
    root.querySelector('.dj-community-cb').checked = !!s.shareCommunity;
    root.querySelector('.dj-promo-cb').checked = !!s.allowPromoted;
    root.querySelector('.dj-knows-state').textContent = s.shareContext ? 'sharing' : 'private';
    root.querySelector('.dj-knows-state').className = 'dj-knows-state' + (s.shareContext ? ' on' : '');
    // every mode shares the same thing: the N most-liked tracks
    root.querySelector('.dj-share .spin-label').textContent = 'Share my ' + djAi.likedN() + ' most-liked tracks';
    root.querySelector('.dj-knows .dj-sec-label').textContent = 'Share your track data';
    root.querySelectorAll('.dj-liked-n button').forEach(function(b){
      var on = Number(b.dataset.n) === djAi.likedN();
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    root.querySelector('.dj-liked-n').hidden = !s.shareContext;

    root.querySelector('.dj-brief').textContent = djAi.briefLine();
    var seeded = this.seeded();
    root.querySelector('.dj-copy').textContent = seeded ? '⧉ COPY TRACK ROLLED JOURNEY' : (this.speed() ? '⧉ COPY DJ BRIEF' : '⧉ COPY PROMPT 1 · DJ BRIEF');
    // the seeds are the brief: no one-shot / Riffenator choice, no Riff Roll dice, no extra sections
    ['.dj-submodes', '.dj-rollbar', '.dj-more', '.dj-est'].forEach(function(sel){ var n = root.querySelector(sel); if (n) n.hidden = seeded; });
    root.querySelector('.dj-reply').placeholder = (this.speed() || seeded)
      ? 'Paste AI response here…'
      : 'Copy prompt 1 — the steps after it open in a pop-up…';
    root.querySelector('.dj-est').textContent = 'DJ thinking time ' + djAi.estimateLabel();
    // only count what's actually on screen — a section hidden behind More
    // settings isn't something the listener has left blank
    if (seeded){
      var n = (djAi.state.seeds || []).length;
      root.querySelector('.dj-copy-note').textContent = n ? '' : 'add a seed track first';
      return;
    }
    var missing = this.mainCats().filter(function(x){ return !djAi.picked(x.key); }).length;
    root.querySelector('.dj-copy-note').textContent = missing
      ? (missing + ' left to the DJ')
      : '';
  },

  async renderKnows(){
    var box = this.el.querySelector('.dj-knows-what');
    if (!box || !this.el.querySelector('.dj-knows').classList.contains('open')) return;
    if (!djAi.state.shareContext){
      box.innerHTML = "<div class='dj-note'>Nothing about your listening goes into the brief. The DJ chooses blind.</div>";
      return;
    }
    var liked = await djAi.likedTracks(djAi.likedN());
    if (!liked.length){
      box.innerHTML = "<div class='dj-note'>You haven't liked any tracks yet (👍 on the deck), so there's nothing to share.</div>";
      return;
    }
    box.innerHTML = "<div class='dj-note'>Exactly this goes into the brief you copy (riffrolled sends nothing itself), and nothing else about your listening:</div>" +
      "<ol class='dj-liked-list' data-testid='dj-liked-list'>" + liked.map(function(t){ return "<li>" + escapeHtml(t) + "</li>"; }).join('') + "</ol>";
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

  /** The whole of RIFF ROLL in one call: throw the dice, redraw, build the
      prompt, copy it, show what it used. Public because the tutorial's
      "ROLL THE RIFF" button is the same press from somewhere else — there
      should only ever be one definition of what that button does. */
  async rollAndCopy(){
    await djAi.ready();            // may be pressed before the menu finished loading
    await djAi.rollAll({ chaos: djAi.state.chaos });
    this.renderSections();
    this.sync();
    var copied = await this.copyBrief({ silent:true });
    this.showUsed(copied);
    return copied;
  },

  /* ── the copy → AI → paste loop, with the trips shortened ────────────
     The brief goes out on the clipboard and the reply comes back on it.
     Everything below is about removing the steps between those two facts:
     opening the AI without hunting for a bookmark, and getting the reply
     in without finding a textarea. */

  /** Copy the brief, then open the chosen AI in a new tab.
      Order matters: the copy is awaited first, because writing to the
      clipboard needs this document focused and opening a tab takes that
      focus away. A popup blocker can still refuse the window, so that
      case is reported rather than silently doing half the job. */
  PREFILL_MAX: 6000,          // encoded characters; see openIn

  async openIn(key, btn){
    var site = DJ_SITES.find(function(s){ return s.key === key; });
    if (!site) return;
    if (btn) btn.disabled = true;
    try {
      var copied = await this.copyBrief({ silent: true });
      var url = site.url;
      /* Pre-fill only what was tested to arrive whole. The one-shot and
         multi-shot prompts run to 11–14,000 characters, far past the ~3,300
         that chatgpt.com/?q= was checked with — and truncation is silent.
         So a long prompt opens the site plain and goes by the clipboard. */
      var text = this._lastPrompt || '';
      var enc = text ? encodeURIComponent(text) : '';
      if (site.q && enc && enc.length <= this.PREFILL_MAX){
        url = site.url + (site.url.indexOf('?') >= 0 ? '&' : '?') + site.q + '=' + enc;
      }
      var w = window.open(url, '_blank', 'noopener');
      if (!w){
        this.status('Your browser blocked the new tab — open ' + site.label + ' yourself; the brief is copied.',
                    copied ? 'ok' : 'err');
        return;
      }
      this.arm();
      this.status(copied
        ? 'Brief copied — paste it into ' + site.label + ', then come back'
        : 'Opened ' + site.label + ', but the clipboard refused the brief', copied ? 'ok' : 'err');
    } finally { if (btn) btn.disabled = false; }
  },

  /** Remember that a brief went out, so returning to the tab can offer to
      read the reply back. `text` is the prompt itself — not the summary
      line on screen, which is what this first reached for and which never
      matches anything on the clipboard. Keeping the real prompt is what
      lets us recognise it coming back unchanged. */
  arm(text){
    this._armed = true;
    this._armedAt = Date.now();
    if (typeof text === 'string') this._sent = text;
  },

  /** Back on the tab with a brief outstanding: offer the one-click paste.
      Only when there is somewhere for it to go — the panel open, the box
      still empty — and only for a while, so it isn't still sitting there
      tomorrow. */
  offerPaste(){
    if (!this._armed || !this.el) return;
    if (Date.now() - (this._armedAt || 0) > 30 * 60 * 1000){ this._armed = false; return; }
    if (this.el.classList.contains('is-hidden')) return;
    if ((this.el.querySelector('.dj-reply').value || '').trim()) return;
    var b = this.el.querySelector('.dj-pasteback');
    b.hidden = false;
    b.textContent = '📋 Paste your reply';
    b.classList.remove('done');
    this.el.querySelector('.dj-import-sec').classList.add('ready');
  },

  /** The click is what makes this legal: reading the clipboard needs a
      user gesture, which a focus event is not. */
  async pasteBack(btn){
    btn.disabled = true;
    try {
      var text = '';
      try { text = await navigator.clipboard.readText(); }
      catch(e){
        btn.hidden = true;
        this.bstatus('Your browser wouldn’t let riffrolled read the clipboard — paste into the box below instead.', 'err');
        this.el.querySelector('.dj-reply').focus();
        return;
      }

      text = String(text || '').trim();
      if (!text){
        this.bstatus('The clipboard is empty — copy your AI’s reply first.', 'err');
        return;
      }
      // The brief coming back unchanged means they haven't been to the AI
      // yet. Worth catching precisely, because the brief *parses*: it ends
      // with a worked example of the output format, and those placeholder
      // rows look exactly like tracks to the parser.
      if (this._sent && text.slice(0, 120) === String(this._sent).slice(0, 120)){
        this.bstatus('That’s still the brief — copy what the AI sent back.', 'err');
        return;
      }
      var items = djAi.isDraft(text) ? djAi.readDraft(text).tracks : djAi.parseReply(text).items;
      if (!items.length){
        this.bstatus('No playlist in that. Copy the whole reply, including the RIFFROLLED-PLAYLIST block.', 'err');
        return;
      }
      /* A track list with no links (a multi-shot draft, or an AI that
         couldn't search) is not refused any more: importText opens the
         Link Hunter pop-up for it. */

      var box = this.el.querySelector('.dj-reply');
      box.value = text;
      box.dispatchEvent(new Event('input'));     // keep the track count honest
      this._armed = false;
      btn.hidden = true;
      await this.importReply();
    } finally { btn.disabled = false; }
  },

  /** build the prompt and put it on the clipboard. Returns whether the
      clipboard actually took it, so the caller can say so honestly. */
  async copyBrief(opts){
    opts = opts || {};
    var btn = this.el.querySelector('.dj-copy');
    btn.disabled = true;
    try {
      var text = await djAi.buildPrompt();
      this._lastPrompt = text;     // openIn reuses this exact text (chaos lines are random)
      /* The billable moment, in both branches below. The brief has been
         built and the person is looking at it either way — on the
         clipboard, or in the fallback box when the clipboard is blocked.
         Not awaited: a placement must never be what stops a brief being
         copied, and the server charges once per brief whenever it
         arrives. */
      djAi.claimPromoted();
      if (window.riffUsage) riffUsage.count('dj_copy');
      try {
        await navigator.clipboard.writeText(text);
        if (window.appToast) appToast('Prompt copied — paste it into your AI', 'ok');
        if (!opts.silent) this.status('Brief copied ✓', 'ok');
        this.el.querySelector('.dj-import-sec').classList.add('ready');
        this.arm(text);             // offer the one-click paste on the way back
        if (!this.speed() && !this.seeded()) this.wizOpen('list', {});      // the Riffenator: on to step 2
        return true;
      } catch(e){
        var box = this.el.querySelector('.dj-promptbox') || (function(sec){
          var t = document.createElement('textarea');
          t.className = 'dj-promptbox'; t.rows = 6; sec.appendChild(t); return t;
        })(this.el.querySelector('.dj-brief-sec'));
        box.value = text; box.select();
        this.status('Select the text below and copy it');
        if (!this.speed() && !this.seeded()) this.wizOpen('list', { prompt1: text });
        if (window.appToast) appToast('Clipboard blocked — the prompt is in the box below', 'warn');
        this.el.querySelector('.dj-import-sec').classList.add('ready');
        return false;
      }
    } catch(e){
      this.status('Could not build the brief: ' + e.message, 'err');
      return false;
    } finally { btn.disabled = false; }
  },

  /* ── THE WIZARD ────────────────────────────────────────────────────────
     A pop-up card over the DJ panel for the steps after "copy":

       multi-shot   1 choose + copy prompt 1   (the panel itself)
                    2 'list'    paste the AI's track list (no links yet)
                    3 'hunt'    copy Link Hunter, paste its reply, import
       either mode  'missing'   the reply was not a full playlist: a Link
                                Hunter prompt for just the missing tracks,
                                and what it finds goes back in its place

     Every step says what to do next, and every step can be closed. */
  wizOpen(step, data){
    this._wiz = Object.assign(this._wiz && step !== 'list' ? this._wiz : {}, data || {}, { step: step });
    this.el.querySelector('.dj-wiz').hidden = false;
    this.wizRender();
    var t = this.el.querySelector('.dj-wiz textarea:not([readonly])');
    if (t) setTimeout(function(){ try { t.focus(); } catch(e){} }, 30);
  },

  wizClose(){
    var pending = this._wiz && this._wiz.shareAfter;
    this.el.querySelector('.dj-wiz').hidden = true;
    this._wiz = null;
    if (pending) this.shareNow(pending);
  },

  /** 🌍 post an imported set to Mixes → Community, and say how it went */
  async shareNow(share){
    var el = this.el.querySelector('.dj-community-status') || (function(sec){
      var d = document.createElement('div'); d.className = 'status-bar dj-community-status';
      d.setAttribute('data-testid', 'dj-community-status'); sec.appendChild(d); return d;
    })(this.el.querySelector('.dj-import-sec'));
    el.className = 'status-bar dj-community-status'; el.textContent = '🌍 Sharing with the community…';
    try {
      var j = await djAi.shareToCommunity(share.playlistId, share);
      el.className = 'status-bar dj-community-status ok';
      el.textContent = j.pending
        ? (j.existing ? '🌍 That exact set is already waiting for its quick check'
                      : '🌍 Sent for a quick check: “' + j.name + '”. A person looks at the first share from each key — once yours is approved, it goes up in Mixes → Community, and so does everything you share after.')
        : j.existing ? '🌍 That exact set is already in Community' : '🌍 Shared to Mixes → Community as “' + j.name + '”';
    } catch(e){
      el.className = 'status-bar dj-community-status err';
      el.textContent = '🌍 Not shared: ' + e.message;
    }
  },

  wizMsg(msg, kind){
    var el = this.el.querySelector('.dj-wiz-msg');
    if (el){ el.textContent = msg || ''; el.className = 'dj-wiz-msg' + (kind ? ' ' + kind : ''); }
  },

  wizRender(){
    var w = this._wiz || {}, html = '';
    var e = escapeHtml;
    var head = function(step, title){
      return "<div class='dj-wiz-head'><span class='dj-wiz-step'>" + e(step) + "</span>" +
        "<button class='dj-wiz-x' data-a='close' title='Close' aria-label='Close'>✕</button></div>" +
        "<div class='dj-wiz-title'>" + e(title) + "</div>";
    };
    var pasteRow = function(go, goLabel, testid){
      return "<div class='dj-wiz-row'><button class='dj-wiz-paste' data-a='paste'>📋 Paste from clipboard</button>" +
        "<button class='dj-wiz-go' data-a='" + go + "' data-testid='" + testid + "'>" + e(goLabel) + "</button></div>";
    };
    var sites = "<div class='dj-wiz-sites'>" + DJ_SITES.map(function(s){
      return "<a href='" + e(s.url) + "' target='_blank' rel='noopener'>" + e(s.label) + " ↗</a>";
    }).join('') + "</div>";

    if (w.step === 'list'){
      html = head('🤖🎸 The Riffenator · Step 2 of 3', 'Get the track list') +
        "<p>" + (w.prompt1 ? 'Copy prompt 1 from the box below, then paste it into your AI.' : 'Prompt 1 is copied. Paste it into your AI:') + "</p>" +
        (w.prompt1 ? "<textarea class='dj-wiz-prompt' readonly rows='4'>" + e(w.prompt1) + "</textarea>" : '') + sites +
        "<p>It answers with a <b>track list</b>: artists and titles, no links yet. Copy its whole reply and paste it here.</p>" +
        "<textarea class='dj-wiz-in' data-testid='dj-wiz-in' rows='6' placeholder='RIFFROLLED-DJ-DRAFT …'></textarea>" +
        pasteRow('list-next', 'Next: Link Hunter →', 'dj-wiz-next');
    } else if (w.step === 'hunt'){
      var n = (w.list && w.list.tracks.length) || 0;
      html = head(w.noneWorked ? 'No playable links' : (w.fromOneShot ? 'Links missing' : '🤖🎸 The Riffenator · Step 3 of 3'), 'Hunt the links') +
        "<p class='dj-wiz-what'>" + n + ' track' + (n === 1 ? '' : 's') +
          (w.list && w.list.name ? ' for “' + e(w.list.name) + '”' : '') +
          (w.noneWorked ? ' — none of the links could be played, so nothing was imported.' : (w.fromOneShot ? ' came back without YouTube links.' : ', no links yet.')) + "</p>" +
        this.wizReasonsHtml() +
        "<button class='dj-wiz-copy' data-a='copy-lh' data-testid='dj-wiz-copy'>⧉ COPY LINK HUNTER</button>" +
        "<textarea class='dj-wiz-prompt' readonly rows='4' hidden></textarea>" +
        "<p>Paste it into an AI that can <b>search the web</b> — the same chat is fine. It finds a real YouTube link for every track. Then paste its reply here.</p>" +
        "<textarea class='dj-wiz-in' data-testid='dj-wiz-in' rows='6' placeholder='RIFFROLLED-PLAYLIST …'></textarea>" +
        pasteRow('hunt-import', '▶ Import playlist', 'dj-wiz-import') +
        (w.fromOneShot && !w.noneWorked ? "<button class='dj-wiz-alt' data-a='hunt-anyway'>Import anyway — riffrolled will try to find them itself</button>" : '');
    } else if (w.step === 'missing'){
      var miss = w.missing || [];
      html = head('Almost there', miss.length ? miss.length + ' of ' + (w.all ? w.all.length : miss.length) + ' tracks still need a link' : 'Imported — but check these links') +
        "<p class='dj-wiz-what'>Imported " + (w.imported || 0) + ' of ' + (w.total || 0) + ' into “' + e(w.name || 'your playlist') + '”' +
          (w.found ? ' · ' + w.found + ' found by riffrolled' : '') + ".</p>" +
        this.wizReasonsHtml() +
        (miss.length ? "<button class='dj-wiz-copy' data-a='copy-lh' data-testid='dj-wiz-copy'>⧉ COPY LINK HUNTER FOR THESE " + miss.length + "</button>" : '') +
        "<textarea class='dj-wiz-prompt' readonly rows='4' hidden></textarea>" +
        "<p>Paste it into an AI that can search the web, then paste its reply here. What it finds goes back into the playlist in its own place.</p>" +
        "<textarea class='dj-wiz-in' data-testid='dj-wiz-in' rows='5' placeholder='RIFFROLLED-PLAYLIST …'></textarea>" +
        pasteRow('missing-add', '＋ Add them to the playlist', 'dj-wiz-add') +
        "<button class='dj-wiz-alt' data-a='close'>Done — keep the playlist as it is</button>";
    }
    html += "<div class='dj-wiz-msg' role='status' aria-live='polite'></div>";
    this.el.querySelector('.dj-wiz-card').innerHTML = html;
  },

  /* Why each track didn't make it, grouped the way the old list was — the
     listener can act on each group differently. Items keep their flags
     (fake, dead, repeatOf, noLink, mismatch), so this works on any list. */
  wizReasons(missing, rep, odd){
    // a track that didn't make it isn't "imported but check it" as well
    var r = { repeated: [], fake: [], dead: [], noLink: [], odd: (odd || []).filter(function(it){ return (missing || []).indexOf(it) < 0; }) };
    (missing || []).forEach(function(it){
      if (it.repeatOf) r.repeated.push(it);
      else if (it.fake) r.fake.push(it);
      else if (it.dead) r.dead.push(it);
      else r.noLink.push(it);
    });
    return r;
  },

  wizReasonsHtml(){
    var w = this._wiz || {}, R = w.reasons, e = escapeHtml;
    if (!R) return '';
    var still = function(list){ return w.step === 'missing' && w.missing ? list.filter(function(it){ return w.missing.indexOf(it) >= 0; }) : list; };
    var name = function(it){ return (it.artist ? it.artist + ' — ' : '') + (it.title || ''); };
    var block = function(cls, head, list, extra){
      if (!list.length) return '';
      return "<div class='dj-why " + cls + "'><div class='dj-why-head'>" + e(head) + "</div>" +
        list.slice(0, 20).map(function(it){
          return "<div class='dj-why-row'>" + e(name(it)) + (extra ? " <span class='dj-why-x'>" + e(extra(it)) + "</span>" : '') + "</div>";
        }).join('') + (list.length > 20 ? "<div class='dj-why-row'>…and " + (list.length - 20) + " more</div>" : '') + "</div>";
    };
    var total = w.total || 0, rep = still(R.repeated), fake = still(R.fake), dead = still(R.dead), nol = still(R.noLink);
    var plural = function(n, one, many){ return n + ' ' + (n === 1 ? one : many); };
    return "<div class='dj-wiz-why' data-testid='dj-wiz-why'>" +
      block('bad', plural(rep.length, 'reuses a link already used for another track', 'reuse a link already used for another track'), rep,
        function(it){ return '→ same video as ' + it.repeatOf; }) +
      block('bad', plural(fake.length, 'link looks made up', 'links look made up') + ' — the same pattern repeated across different videos', fake,
        function(it){ return it.fakeId ? '(' + it.fakeId + ')' : ''; }) +
      block('bad', dead.length + ' of ' + total + ' links point at videos that don’t exist', dead) +
      block('bad', plural(nol.length, 'track', 'tracks') + ' had no YouTube link and riffrolled couldn’t find one', nol,
        function(it){ return it.noLink ? '(' + it.noLink + ')' : ''; }) +
      block('odd', plural(R.odd.length, 'link', 'links') + ' may play something else — they were imported, check them', R.odd,
        function(it){ return '→ ' + (it.mismatch || ''); }) +
    "</div>";
  },

  /** the Link Hunter prompt for the step on screen */
  wizHunterPrompt(){
    var w = this._wiz || {};
    if (w.step === 'missing') return djAi.buildLinkHunterFor(w.missing || [], w.name);
    return w.lhPrompt || '';
  },

  async onWiz(e){
    var b = e.target.closest('[data-a]');
    if (!b || !this._wiz) return;
    var a = b.dataset.a, self = this, w = this._wiz;
    var input = this.el.querySelector('.dj-wiz-in');
    var text = input ? input.value.trim() : '';

    if (a === 'close'){ this.wizClose(); return; }

    if (a === 'paste'){
      try {
        var clip = await navigator.clipboard.readText();
        if (input) input.value = String(clip || '').trim();
        this.wizMsg(clip ? '' : 'The clipboard is empty — copy the AI’s reply first.', clip ? '' : 'err');
      } catch(err){ this.wizMsg('Your browser wouldn’t let riffrolled read the clipboard — paste into the box instead.', 'err'); if (input) input.focus(); }
      return;
    }

    if (a === 'copy-lh'){
      var p = this.wizHunterPrompt();
      try {
        await navigator.clipboard.writeText(p);
        this.arm(p);
        this.wizMsg('Link Hunter copied ✓ — paste it into your AI, then paste its reply below.', 'ok');
        if (window.appToast) appToast('Link Hunter copied — paste it into your AI', 'ok');
      } catch(err){
        var box = this.el.querySelector('.dj-wiz-prompt[hidden]') || this.el.querySelector('.dj-wiz-prompt');
        if (box){ box.hidden = false; box.value = p; box.select(); }
        this.wizMsg('Clipboard blocked — select the text in the box and copy it.', 'err');
      }
      return;
    }

    if (a === 'list-next'){
      if (!text){ this.wizMsg('Paste the AI’s reply first.', 'err'); return; }
      if (this._sent && text.slice(0, 120) === String(this._sent).slice(0, 120)){ this.wizMsg('That’s still prompt 1 — paste what the AI sent back.', 'err'); return; }
      var parsed = djAi.parseReply(text);
      // already a full playlist? then there is nothing to hunt
      if (!djAi.isDraft(text) && parsed.items.length && parsed.items.every(function(it){ return it.url; })){
        this.wizClose();
        this.el.querySelector('.dj-reply').value = text;
        await this.importReply();
        return;
      }
      var lh = djAi.buildLinkHunter(text);
      if (!lh){ this.wizMsg('No track list in that. The lines should look like:  1 | Artist | Title | 3:42 | Genre | why', 'err'); return; }
      this.wizOpen('hunt', { list: lh.draft, lhPrompt: lh.prompt, fromOneShot: false });
      return;
    }

    if (a === 'hunt-import' || a === 'hunt-anyway'){
      if (a === 'hunt-anyway') text = w.raw || '';
      if (!text){ this.wizMsg('Paste Link Hunter’s reply first.', 'err'); return; }
      if (a === 'hunt-import' && (djAi.isDraft(text) || (this._sent && text.slice(0, 120) === String(this._sent).slice(0, 120)))){
        this.wizMsg('That’s still the track list (or the prompt) — paste Link Hunter’s reply, the one with the links.', 'err'); return;
      }
      b.disabled = true;
      this.wizMsg('Checking links…');
      try { await this.importText(text, { force: a === 'hunt-anyway', wizard: true }); }
      finally { b.disabled = false; }
      return;
    }

    if (a === 'missing-add'){
      if (!text){ this.wizMsg('Paste Link Hunter’s reply first.', 'err'); return; }
      var found = djAi.matchFound(w.missing, text);
      if (!found.length){ this.wizMsg('No links for these tracks in that reply. Paste Link Hunter’s whole reply.', 'err'); return; }
      b.disabled = true;
      try {
        this.wizMsg('Checking ' + found.length + ' link' + (found.length > 1 ? 's' : '') + '…');
        await djAi.checkLinks(found, function(){});
        var live = found.filter(function(it){ return !it.dead; });
        live.forEach(function(it){ it.url = it.url; });
        if (live.length) await djAi.addFound(w.playlistId, live, w.all);
        w.missing = w.missing.filter(function(it){ return live.indexOf(it) < 0; });
        if (window.plBoss && plBoss.activeId === w.playlistId){ await plBoss.renderTracks(); }
        var dead = found.length - live.length;
        if (!w.missing.length){
          this.wizClose();
          this.bstatus('All tracks found ✓ · ' + live.length + ' added to “' + (w.name || 'your playlist') + '”', 'ok');
          return;
        }
        this.wizRender();
        this.wizMsg('Added ' + live.length + (dead ? ' · ' + dead + ' of those links don’t exist' : '') + '. ' + w.missing.length + ' still missing — copy Link Hunter again for these, or press Done.', live.length ? 'ok' : 'err');
      } finally { b.disabled = false; }
    }
  },

  async importReply(){
    return this.importText(this.el.querySelector('.dj-reply').value, {});
  },

  /* Import a reply. A track list without links (a multi-shot draft, or a
     one-shot reply from an AI that couldn't search) is not imported: it
     opens Link Hunter. After an import, anything still without a link
     opens the "still missing" pop-up. */
  async importText(raw, opts){
    opts = opts || {};
    var root = this.el, self = this;
    var say = function(msg, kind){ self.bstatus(msg, kind); if (opts.wizard) self.wizMsg(msg, kind); };
    if (djAi.isDraft(raw)){
      var lhD = djAi.buildLinkHunter(raw);
      if (!lhD){ say('That looks like a track list, but no lines were readable. They should look like:  1 | Artist | Title | 3:42 | Genre | why', 'err'); return; }
      this.wizOpen('hunt', { list: lhD.draft, lhPrompt: lhD.prompt, fromOneShot: false });
      return;
    }
    var parsed = djAi.parseReply(raw);
    if (parsed.items.length && !opts.force && !parsed.items.some(function(it){ return it.url; })){
      var lh = djAi.buildLinkHunter(raw);
      this.wizOpen('hunt', { list: lh.draft, lhPrompt: lh.prompt, fromOneShot: true, raw: raw });
      return;
    }

    if (!parsed.items.length){
      say('Could not read a playlist in that. Paste the whole reply, or ask for the RIFFROLLED-PLAYLIST block again.', 'err');
      return;
    }
    var go = root.querySelector('.dj-go');
    go.disabled = true;
    root.querySelector('.dj-deadlist').innerHTML = '';
    try {
      /* Check the links before anything is imported. An AI will claim it
         searched YouTube and hand back invented ids — this is free to
         verify, so there is no reason to find out on the deck. */
      djAi.flagInvented(parsed.items);
      this.bstatus('Checking links…');
      var report = await djAi.checkLinks(parsed.items, function(done, total, label){
        self.bstatus('Checking link ' + done + '/' + total + (label ? ' · ' + label : '') + '…');
      });

      /* Now go and find the ones the AI left blank, or whose links turned
         out to be dead. The brief tells the AI an empty cell is a correct
         answer; this is the half that makes that true. After the check,
         so a track whose link was invented gets a second chance rather
         than being dropped for the AI's mistake. */
      parsed.items.forEach(function(it){ if (it.dead) it.url = ''; });
      var found = await djAi.resolveMissing(parsed.items, function(n){
        self.bstatus('Looking up ' + n + ' track' + (n > 1 ? 's' : '') + ' without a link…');
      });
      var dead = parsed.items.filter(function(it){ return it.dead; });
      var odd = parsed.items.filter(function(it){ return it.mismatch; });
      var rep = djAi.importReport(parsed.items);
      // the breakdown now lives in the pop-up (see wizReasons), not under the box
      root.querySelector('.dj-deadlist').innerHTML = '';

      this.bstatus('Importing…');
      var saved = await djAi.importPlaylist(parsed, raw);
      if (!saved){
        /* Nothing playable at all: say why, track by track, and hand over
           Link Hunter for the whole set rather than a one-line error. */
        var allBad = parsed.items.slice();
        allBad.forEach(function(it){ it.url = ''; });
        this.wizOpen('hunt', { list: { name: parsed.name, tracks: allBad }, lhPrompt: djAi.buildLinkHunterFor(allBad, parsed.name),
          fromOneShot: true, noneWorked: true, raw: '', reasons: this.wizReasons(allBad, rep, odd), total: allBad.length, imported: 0 });
        this.bstatus(dead.length
          ? ('Every link in that reply was fake — ' + dead.length + ' of ' + parsed.items.length +
             ' point at videos that do not exist. The tracks are probably fine; the links are not.')
          : 'No track in that reply had a YouTube link, so there is nothing to play.', 'err');
        return;
      }

      // the playlist belongs in the Playlist panel, not in here
      await plBoss.setActivePlaylist(saved.playlistId);
      await plBoss.renderTracks();
      plBoss.renderPlaylists();
      if (window.searchBoss) searchBoss.render();
      if (window.dock) dock.openPanel(plBoss.currentEl);
      if (plBoss.queue.length) plBoss.playIndex(0);

      /* Say what happened to the ones that did not make it. "Imported 4
         tracks · 11 skipped" was true and useless: eleven went for three
         different reasons and the listener could act on each. */
      if (window.riffUsage) riffUsage.count('dj_import');
      var R = saved.report || { noLink:[], repeated:[], dead:[], total: saved.count };
      var bits = ['Imported ' + saved.count + ' of ' + R.total];
      if (saved.totalSecs) bits.push(djAi.fmtSecs(saved.totalSecs));
      if (found && found.found) bits.push(found.found + ' found by riffrolled');
      if (R.noLink.length) bits.push(R.noLink.length + " couldn't be found");
      if (R.repeated.length) bits.push(R.repeated.length + ' reused another track’s link');
      if (R.dead.length) bits.push(R.dead.length + ' dead link' + (R.dead.length > 1 ? 's' : ''));
      if (report && report.renamed) bits.push(report.renamed + ' retitled from YouTube');
      if (report && report.offline) bits.push("couldn't reach YouTube to check");
      bits.push('→ Playlist');
      this.bstatus(bits.join(' · '), 'ok');
      /* The same numbers as attributes. The sentence above is written for
         a person and will be reworded; these will not. */
      var sEl = root.querySelector('.dj-bstatus');
      if (sEl){
        sEl.setAttribute('data-imported', String(saved.count));
        sEl.setAttribute('data-parsed', String(R.total));
        sEl.setAttribute('data-playlist', saved.name || '');
      }
      try { window.dispatchEvent(new CustomEvent('riffrolled:changed',
        { detail: { action:'importReply', imported: saved.count, parsed: R.total } })); } catch(e){}

      root.querySelector('.dj-reply').value = '';
      root.querySelector('.dj-parsed').textContent = '';
      if (window.djHistoryBoss) djHistoryBoss.render();

      /* Not a full playlist? Everything that didn't make it — no link,
         a dead link, a link reused from another track — goes to Link
         Hunter in one pop-up, and comes back into its own place. */
      var missing = (R.noLink || []).concat(R.dead || [], R.repeated || []);
      missing.sort(function(a, b){ return parsed.items.indexOf(a) - parsed.items.indexOf(b); });
      missing.forEach(function(it){ it.url = ''; });
      // 🌍 sharing waits until any gaps are filled, so the shared mix is the finished one
      var share = djAi.state.shareCommunity ? { playlistId: saved.playlistId, name: parsed.name || saved.name, about: parsed.about, genre: parsed.genre } : null;
      if (missing.length || odd.length){
        this.wizOpen('missing', { playlistId: saved.playlistId, all: parsed.items, missing: missing, name: saved.name,
          reasons: this.wizReasons(missing, R, odd), total: R.total, imported: saved.count, found: (found && found.found) || 0,
          shareAfter: share });
      } else {
        if (opts.wizard) this.wizClose();
        if (share) this.shareNow(share);
      }
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
/* A clock with an arrow running back round it: History. */
var HISTORY_SVG =
  "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='#9aa4c0' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'>" +
    "<path d='M3.6 12a8.4 8.4 0 1 0 2.5-6'/>" +
    "<path d='M3.2 3.8v4.1h4.1'/>" +
    "<path d='M12 7.6V12l3 2'/>" +
  "</svg>";

/* History: what you have listened to and liked (Liked, Most played,
   Recent), and the DJ sets you have built. Everything here is read from
   this browser's own database: likes, plays and sets never leave the
   device, and nothing here is sent anywhere. */
var djHistoryBoss = {
  tab: 'liked',

  setup(){
    var main =
      "<div class='hist-tabs' role='tablist' data-testid='hist-tabs'>" +
        "<button class='hist-tab' role='tab' data-tab='liked' data-testid='hist-tab-liked'>👍 Liked</button>" +
        "<button class='hist-tab' role='tab' data-tab='played' data-testid='hist-tab-played'>▶ Most played</button>" +
        "<button class='hist-tab' role='tab' data-tab='recent' data-testid='hist-tab-recent'>Recent</button>" +
        "<button class='hist-tab' role='tab' data-tab='sets' data-testid='hist-tab-sets'>DJ sets</button>" +
        "<button class='hist-tab' role='tab' data-tab='ads' data-testid='hist-tab-ads'>Ads</button>" +
      "</div>" +
      "<div class='sec hist-music' data-testid='hist-music'>" +
        "<div class='ym-list scrollable'></div>" +
        "<div class='ym-foot'><button class='ym-make' data-testid='ym-make'>Make a playlist of these</button></div>" +
      "</div>" +
      "<div class='sec hist-sets' hidden>" +
        "<div class='sec-head'>Your DJ sets</div>" +
        "<div class='dj-hist scrollable'></div>" +
      "</div>" +
      "<div class='status-bar dj-hist-status'></div>" +
      "<div class='ym-note'>Kept in this browser only. Nothing here is sent anywhere.</div>";
    this.el = menuB.createMenu(HISTORY_SVG + ' History', main);
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

    this.el.querySelector('.hist-tabs').addEventListener('click', function(e){
      var b = e.target.closest('.hist-tab'); if (b) self.show(b.dataset.tab);
    });
    this.el.querySelector('.ym-list').addEventListener('click', function(e){ self.onMusic(e); });
    this.el.querySelector('.ym-make').addEventListener('click', function(){ self.makePlaylist(); });
    // a like or a play elsewhere refreshes the list, if it is on screen
    document.addEventListener('riffrolled:music', function(){
      if (!self.el.classList.contains('is-hidden') && self.tab !== 'sets' && self.tab !== 'ads') self.renderMusic();
    });
    document.addEventListener('riffrolled:ads', function(){
      if (!self.el.classList.contains('is-hidden') && self.tab === 'ads') self.renderMusic();
    });
    // fresh numbers every time the panel is opened
    var wasHidden = true;
    new MutationObserver(function(){
      var hidden = self.el.classList.contains('is-hidden');
      if (wasHidden && !hidden) self.show(self.tab, true);
      wasHidden = hidden;
    }).observe(this.el, { attributes: true, attributeFilter: ['class'] });
    (async function(){
      try { var t = await dbBoss.getSetting('historyTab'); if (t) self.tab = t; } catch(e){}
      self.show(self.tab, true);
    })();
  },

  show(tab, quiet){
    if (['liked', 'played', 'recent', 'sets', 'ads'].indexOf(tab) < 0) tab = 'liked';
    this.tab = tab;
    var el = this.el;
    el.querySelectorAll('.hist-tab').forEach(function(b){
      var on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    el.querySelector('.hist-sets').hidden = tab !== 'sets';
    el.querySelector('.hist-music').hidden = tab === 'sets';
    if (!quiet) try { dbBoss.setSetting('historyTab', tab); } catch(e){}
    if (tab === 'sets') this.render(); else this.renderMusic();
  },

  /* ── your music: liked, most played, recent ── */
  async musicRows(tab){
    var tracks = await db.tracks.toArray();
    var byYt = {};
    tracks.forEach(function(t){ if (t.ytId) byYt[t.ytId] = t; });
    var plays = await dbBoss.getPlayCounts();
    var likes = {}, dislikes = {}, lastLike = {};
    (await db.reactions.toArray()).forEach(function(r){
      if (r.kind === 'like'){ likes[r.ytId] = (likes[r.ytId] || 0) + 1; lastLike[r.ytId] = Math.max(lastLike[r.ytId] || 0, r.ts || 0); }
      else if (r.kind === 'dislike') dislikes[r.ytId] = (dislikes[r.ytId] || 0) + 1;
    });
    var ids;
    if (tab === 'liked'){
      // most liked first; a tie goes to the one liked most recently
      ids = Object.keys(likes).sort(function(a, b){ return (likes[b] - likes[a]) || (lastLike[b] - lastLike[a]); });
    } else if (tab === 'played'){
      ids = Object.keys(plays).sort(function(a, b){ return plays[b] - plays[a]; });
    } else {
      var seen = {}, recent = await db.playHistory.orderBy('ts').reverse().limit(400).toArray();
      ids = [];
      recent.forEach(function(h){ if (h.ytId && !seen[h.ytId]){ seen[h.ytId] = h.ts; ids.push(h.ytId); } });
      this._when = seen;
    }
    return ids.filter(function(id){ return byYt[id] && byYt[id].playable !== 0; }).slice(0, 50).map(function(id){
      var t = byYt[id];
      return { ytId: id, id: t.id, name: t.name || id, artist: t.artist || '', likes: likes[id] || 0, dislikes: dislikes[id] || 0, plays: plays[id] || 0 };
    });
  },

  async renderMusic(){
    var box = this.el.querySelector('.ym-list');
    var tab = this.tab;
    if (tab === 'ads') return this.renderAds();
    var rows = await this.musicRows(tab);
    if (this.tab !== tab) return;
    this._rows = rows;
    this.el.querySelector('.ym-foot').hidden = rows.length < 2;
    if (!rows.length){
      box.innerHTML = "<div class='empty' data-testid='ym-empty'>" + (tab === 'liked'
        ? 'Nothing liked yet.<br>Press 👍 on the deck when a track hits.'
        : 'Nothing played yet.') + "</div>";
      return;
    }
    var when = this._when || {};
    box.innerHTML = rows.map(function(r, i){
      var meta = [];
      meta.push("<span title='Times you liked it'>👍 " + r.likes + "</span>");
      meta.push("<span title='Times it played in this browser'>▶ " + r.plays + (r.plays === 1 ? ' play' : ' plays') + "</span>");
      if (tab === 'recent' && when[r.ytId]) meta.push("<span>" + escapeHtml(djHistoryBoss.ago(when[r.ytId])) + "</span>");
      return "<div class='ym-row" + (r.ytId === player.currentYtId ? ' now' : '') + "' data-yt='" + escapeHtml(r.ytId) + "' data-testid='ym-row'>" +
        "<span class='ym-n'>" + (i + 1) + "</span>" +
        "<div class='ym-txt'>" +
          "<div class='ym-name'>" + (r.artist ? "<span class='track-artist'>" + escapeHtml(r.artist) + "</span>" : '') + escapeHtml(r.name) + "</div>" +
          "<div class='ym-meta'>" + meta.join(" <span class='mx-dot'>·</span> ") + "</div>" +
        "</div>" +
        "<button class='ym-play' title='Play it now' aria-label='Play it now'>▶</button>" +
        "<button class='ym-add' title='Add to the playlist in the Playlist window' aria-label='Add to the current playlist'>＋</button>" +
      "</div>";
    }).join('');
  },

  /* ── Ads: the last 20 promoted cards this browser was shown (Dexie only) ── */
  async renderAds(){
    var box = this.el.querySelector('.ym-list');
    var rows = [];
    try { rows = await dbBoss.getAdHistory(); } catch(e){}
    if (this.tab !== 'ads') return;
    this._ads = rows;
    this.el.querySelector('.ym-foot').hidden = true;
    if (!rows.length){
      box.innerHTML = "<div class='empty' data-testid='ads-empty'>No promoted tracks yet.<br>The last 20 you were shown will be kept here.</div>";
      return;
    }
    var self = this;
    box.innerHTML = rows.map(function(r, i){
      return "<div class='ym-row ad-row' data-ad='" + Number(r.id) + "' data-testid='ad-row'>" +
        "<img class='ad-thumb' src='https://i.ytimg.com/vi/" + encodeURIComponent(r.ytId) + "/default.jpg' alt='' width='34' height='34' loading='lazy'>" +
        "<div class='ym-txt'>" +
          "<div class='ym-name'>" + escapeHtml(r.name || r.ytId) + "</div>" +
          "<div class='ym-meta'><span class='ad-chip'>Promoted</span> <span class='mx-dot'>·</span> <span>" + escapeHtml(self.ago(r.ts)) + "</span></div>" +
        "</div>" +
        "<button class='ym-play' title='Play it now' aria-label='Play it now'>▶</button>" +
        "<button class='ym-add' title='Add to the playlist in the Playlist window' aria-label='Add to the current playlist'>＋</button>" +
        "<button class='ad-x' title='Remove from this list' aria-label='Remove from this list'>✕</button>" +
      "</div>";
    }).join('') + "<div class='ad-note'>Playing or adding one from here counts as a play for whoever promoted it. It never costs them a credit.</div>";
  },

  async onAd(e){
    var row = e.target.closest('.ad-row'); if (!row) return;
    var r = (this._ads || []).find(function(x){ return x.id === Number(row.dataset.ad); });
    if (!r) return;
    var cur = { id: r.promoId, url: r.url, ytId: r.ytId, name: r.name };
    if (e.target.closest('.ad-x')){ await dbBoss.forgetAd(r.id); return; }
    if (e.target.closest('.ym-add')){
      if (!plBoss.activeId){ this.status('Open or make a playlist first', 'err'); return; }
      var tid = await dbBoss.createTrack(r.ytId, r.name);
      var res = await dbBoss.addToPlaylist(plBoss.activeId, tid);
      plBoss.afterDbChange();
      if (window.promoPopup) promoPopup.count('play', cur);
      this.status(res === 'added' ? 'Added to the playlist' : 'It’s already in that playlist', 'ok');
      return;
    }
    if (e.target.closest('.ym-play') || e.target.closest('.ym-txt')){
      player.load(r.ytId, r.name);
      if (window.promoPopup) promoPopup.count('play', cur);
    }
  },

  ago(ts){
    var sec = Math.max(0, (Date.now() - ts) / 1000);
    if (sec < 90) return 'just now';
    if (sec < 5400) return Math.round(sec / 60) + 'm ago';
    if (sec < 172800) return Math.round(sec / 3600) + 'h ago';
    return Math.round(sec / 86400) + 'd ago';
  },

  async onMusic(e){
    if (this.tab === 'ads') return this.onAd(e);
    var row = e.target.closest('.ym-row'); if (!row) return;
    var r = (this._rows || []).find(function(x){ return x.ytId === row.dataset.yt; });
    if (!r) return;
    if (e.target.closest('.ym-add')){
      if (!plBoss.activeId){ this.status('Open or make a playlist first', 'err'); return; }
      var res = await dbBoss.addToPlaylist(plBoss.activeId, r.id);
      plBoss.afterDbChange();
      this.status(res === 'added' ? 'Added to the playlist' : 'It’s already in that playlist', 'ok');
      return;
    }
    if (e.target.closest('.ym-play') || e.target.closest('.ym-txt')) player.load(r.ytId, r.name);
  },

  /** The list on screen, as a playlist of its own. */
  async makePlaylist(){
    var rows = this._rows || [];
    if (!rows.length) return;
    var name = { liked: 'Liked tracks', played: 'Most played', recent: 'Recently played' }[this.tab] || 'Your music';
    var id = await dbBoss.createPl(name + ' · ' + new Date().toLocaleDateString());
    for (var i = 0; i < rows.length; i++) await dbBoss.addToPlaylist(id, rows[i].id);
    await plBoss.setActivePlaylist(id);
    await plBoss.renderTracks();
    plBoss.renderPlaylists();
    if (window.dock) dock.openPanel(plBoss.currentEl);
    this.status('Made a playlist of ' + rows.length + ' tracks', 'ok');
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

/* ── shared in from the OS ───────────────────────────────────────────────
   Android's share sheet can send riffrolled the text you have selected,
   which for our purposes is an AI's reply. The service worker catches the
   POST and stashes it; this picks it up on the way back in.

   Registration is deliberately quiet and failure-tolerant: a browser that
   has no service workers, or a context that forbids them, simply doesn't
   get the feature. Nothing else depends on it. */
var shareIn = {
  init(){
    if (!('serviceWorker' in navigator)) return;
    var self = this;

    navigator.serviceWorker.addEventListener('message', function(e){
      if (e.data && e.data.type === 'riffrolled:share') self.take(e.data.text);
    });

    navigator.serviceWorker.register('/sw.js').then(function(){
      // only ask when we were actually opened by a share
      if (new URLSearchParams(location.search).get('shared') === null) return;
      history.replaceState(null, '', location.pathname);   // don't re-import on reload
      navigator.serviceWorker.ready.then(function(reg){
        var sw = reg.active || navigator.serviceWorker.controller;
        if (sw) sw.postMessage({ type: 'riffrolled:take-share' });
      });
    }).catch(function(){ /* no service worker, no share target — fine */ });
  },

  /* A share is only ever a reply: drop it into the importer and run it,
     the same path the paste button takes. */
  take(text){
    text = String(text || '').trim();
    if (!text || !window.djMenuBoss || !djMenuBoss.el) return;
    if (!djAi.parseReply(text).items.length){
      if (window.appToast) appToast('That share didn’t contain a playlist', 'warn');
      return;
    }
    if (window.dock) dock.openPanel(djMenuBoss.el);
    var box = djMenuBoss.el.querySelector('.dj-reply');
    box.value = text;
    box.dispatchEvent(new Event('input'));
    djMenuBoss.importReply();
  }
};
shareIn.init();
