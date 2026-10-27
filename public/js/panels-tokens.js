/* riffrolled — panels-tokens.js
   The riff economy: the shared wallet key, Mine (hashcash
   proof-of-work), Promote (spend tokens, track engagement). */

/* ── RIFF MINE — hashcash proof-of-work token mining (RPOW spirit).
   The server issues a challenge; a Web Worker grinds SHA-256(challenge:nonce)
   until it has enough leading zero bits; the server verifies with one hash
   and credits the ledger. Wallet = a random bearer key kept in local settings:
   guard it like a password, lose it and the balance is gone. ── */
/* A gig flyer: a crooked, torn-edged poster with a starburst and a music note,
   the kind pasted to a wall outside a tiny venue. Promoting is "spread the word
   about good music", not advertising — so, no megaphone. Chunky shapes only:
   it has to read at 20px. Paper, black ink and one gold accent (the Promote colour). */
var PROMOTE_SVG =
  "<svg viewBox='0 0 24 24' aria-hidden='true'>" +
    "<defs><linearGradient id='pmg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ffcc4d'/><stop offset='1' stop-color='#ff8a3d'/></linearGradient></defs>" +
    "<g transform='rotate(-10 12 12)'>" +
      "<path d='M4.6 2.6 H16.6 L18.2 4.1 L17.4 5.4 L19.2 6.6 L18.6 8 L19.4 9.4 V21 H4.6 Z' fill='#f3ecd8' stroke='#0b0b12' stroke-width='1.1' stroke-linejoin='round'/>" +
      "<polygon points='12.7,4.4 13.6,7.4 16.6,6.6 15.1,9.3 17.8,10.9 14.8,11.8 15.6,14.8 12.9,13.3 11.3,16.0 10.4,13.0 7.4,13.8 8.9,11.1 6.2,9.5 9.2,8.6 8.4,5.6 11.1,7.1' fill='url(#pmg)' stroke='#0b0b12' stroke-width='.8' stroke-linejoin='round'/>" +
      "<path d='M10.6 11.4 V8.3 L13.6 7.6 V10.6' fill='none' stroke='#0b0b12' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'/>" +
      "<ellipse cx='9.9' cy='11.5' rx='1.1' ry='.85' fill='#0b0b12'/><ellipse cx='12.9' cy='10.7' rx='1.1' ry='.85' fill='#0b0b12'/>" +
      "<rect x='6.4' y='16' width='10.2' height='1.3' rx='.4' fill='#0b0b12'/><rect x='6.4' y='18.3' width='6.4' height='1.3' rx='.4' fill='#0b0b12'/>" +
    "</g>" +
  "</svg>";

/* The wallet both mining and promoting sit on top of: two keys.
     private key  64 random hex characters, made here and kept here. It is
                  your wallet — copy it to use your tokens on another device.
     public key   sha256 of it (src/wallet.js says exactly how). The server
                  files your wallet under this and never stores the private
                  key; it is safe to show and share.
   Nothing about you is in either. */
var riffWallet = {
  PREFIX: 'riffrolled/wallet/v1:',

  /** the PRIVATE key (created on first use) */
  async get(){
    if (this._w) return this._w;
    /* One creation, however many callers. The Mine panel, the Promote
       panel and the keys section all ask at boot; without this, each could
       mint its own key on a first visit and the panels would disagree. */
    if (!this._making) this._making = (async () => {
      let w = await dbBoss.getSetting('wallet');
      if (!w){
        const a = new Uint8Array(32); crypto.getRandomValues(a);
        w = [...a].map(b => b.toString(16).padStart(2, '0')).join('');
        await dbBoss.setSetting('wallet', w);
      }
      this._w = w;
      return w;
    })();
    try { return await this._making; } finally { this._making = null; }
  },

  /** headers for the anonymous calls (pop-up card, DJ brief placements) —
   *  they carry the key only if this browser already has one, and never
   *  make one. The server uses it for a single thing: not showing you your
   *  own campaign. */
  async peekHeaders(extra){
    var w = this._w || (window.dbBoss ? await dbBoss.getSetting('wallet') : '');
    return Object.assign(w ? { 'X-Riff-Key': w } : {}, extra || {});
  },

  /** the PUBLIC key: what riffrolled's server knows this wallet as */
  async publicKey(){
    var w = await this.get();
    if (this._pubFor === w && this._pub) return this._pub;
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.PREFIX + w));
    this._pub = [...new Uint8Array(buf)].map(function(b){ return b.toString(16).padStart(2, '0'); }).join('');
    this._pubFor = w;
    return this._pub;
  },

  /** short form for display: rr·1a2b3c4d…9f8e */
  shortPub(pub){ return 'rr·' + pub.slice(0, 8) + '…' + pub.slice(-4); },

  /** headers that carry the private key — kept out of URLs, so it never lands in a log */
  async headers(extra){
    return Object.assign({ 'X-Riff-Key': await this.get() }, extra || {});
  },

  /** switch this browser to another private key (one from another device) */
  async use(k){
    k = String(k || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(k)) throw new Error('That is not a private key (64 characters, 0–9 and a–f)');
    await dbBoss.setSetting('wallet', k);
    this._w = k; this._pub = null; this._pubFor = null; this._making = null;
    return k;
  }
};

var mineBoss = {
  running: false,

  wallet(){ return riffWallet.get(); },

  setup(){
    var main =
      "<div class='sec'>" +
        "<div class='sec-head'>Riff tokens</div>" +
        "<div class='mine-balrow'><span class='mine-bal'>–</span><span class='mine-bal-lbl'>tokens</span></div>" +
        "<div class='mine-meta'>mined today: <span class='mine-today'>–</span>" +
          "<span class='mine-tier'></span></div>" +
        /* Difficulty moves now, so it has to be visible. A number that
           changes without explanation reads as the site cheating you. */
        "<div class='mine-meta mine-diff'></div>" +
        "<div class='mine-totals'>" +
          "<span class='mt-earned' title='Tokens mined, all time'>⛏ <b>–</b> earned</span>" +
          "<span class='mt-spent' title='Tokens spent on promotions'>📣 <b>–</b> spent</span>" +
        "</div>" +
        "<div class='row mine-ctl'>" +
          "<button class='icon-btn mine-toggle' title='Start mining'>⛏ Start mining</button>" +
        "</div>" +
        // what you have earned by contributing, this period — empty and
        // collapsed when contribution rewards are switched off
        "<div class='mine-contrib'></div>" +
        "<div class='mine-meta mine-rate'></div>" +
        "<div class='status-bar mine-status'></div>" +
        "<div class='sec-head mine-hist-head'>Recent activity</div>" +
        "<div class='mine-ledger'></div>" +
        "<div class='mine-note'>Mining burns CPU (and battery on phones). Tokens are spent in the Promote panel — they have no cash value.</div>" +
      "</div>" +
      "<div class='sec wallet-sec'>" +
        "<div class='sec-head'>🔑 Your keys</div>" +
        "<div class='wallet-lbl'>Public key <span class='wallet-hint'>— safe to share</span></div>" +
        "<div class='row'>" +
          "<code class='wallet-pub' data-testid='wallet-pub' title=''>…</code>" +
          "<button class='icon-btn wallet-pub-copy' title='Copy your public key'>⧉</button>" +
        "</div>" +
        "<div class='wallet-lbl'>Private key <span class='wallet-hint warn'>— keep it secret</span></div>" +
        "<div class='row'>" +
          "<input type='password' class='wallet-key' data-testid='wallet-key' readonly spellcheck='false' autocomplete='off'>" +
          "<button class='icon-btn wallet-show' title='Show / hide'>👁</button>" +
          "<button class='icon-btn wallet-copy' title='Copy your private key'>⧉</button>" +
        "</div>" +
        "<div class='wallet-note'>Your tokens belong to your <b>private key</b>, not to this browser. Copy it somewhere safe — it is the only way to use your wallet on another device or after clearing this site's data. Anyone who has it controls the balance. riffrolled only ever stores your public key.</div>" +
        "<details class='wallet-move'><summary>Use a private key from another device</summary>" +
          "<div class='row'>" +
            "<input type='password' class='wallet-new' data-testid='wallet-new' spellcheck='false' autocomplete='off' placeholder='Paste the private key'>" +
            "<button class='wallet-save' data-testid='wallet-save'>Use it here</button>" +
          "</div>" +
          "<div class='wallet-note'>This browser's current key is replaced. Copy it first if it holds tokens you want to keep.</div>" +
        "</details>" +
        "<div class='status-bar wallet-status'></div>" +
      "</div>";
    this.el = menuB.createMenu('⛏ Mine', main);
    menuB.place(this.el, { right:'800px', top:'120px', width:'300px' });

    var self = this;
    this.el.querySelector('.mine-toggle').onclick = function(){ self.running ? self.stop() : self.start(); };
    this.bindWallet();
    this.refresh();
  },

  /* first tokens earned: say once, plainly, that the key is the balance.
     Nobody reads the fine print until they've lost something. */
  async nudgeBackup(){
    if (this._nudged) return;
    this._nudged = true;
    if (await dbBoss.getSetting('walletNudged')) return;
    await dbBoss.setSetting('walletNudged', '1');
    appNotify('Your tokens belong to your wallet key, not this browser — copy it from the Mine panel and keep it safe. Clearing site data without it loses the balance for good.', 'warn');
    var sec = this.el.querySelector('.wallet-sec');
    if (sec){ sec.classList.add('flash'); setTimeout(function(){ sec.classList.remove('flash'); }, 3000); }
  },

  /* view / copy / restore the wallet key — the only thing standing between
     a user and their balance, so it must be portable */
  bindWallet(){
    var self = this;
    var input = this.el.querySelector('.wallet-key');
    var st = this.el.querySelector('.wallet-status');
    function say(msg, kind){
      st.textContent = msg || '';
      st.className = 'status-bar wallet-status' + (kind ? ' ' + kind : '');
      if (msg && kind === 'ok') setTimeout(function(){ if (st.textContent === msg) say(''); }, 5000);
    }
    var pubEl = this.el.querySelector('.wallet-pub');
    var showKeys = async function(){
      input.value = await riffWallet.get();
      var pub = await riffWallet.publicKey();
      pubEl.textContent = riffWallet.shortPub(pub);
      pubEl.title = pub;
      pubEl.dataset.full = pub;
    };
    showKeys();

    this.el.querySelector('.wallet-show').onclick = function(){
      input.type = input.type === 'password' ? 'text' : 'password';
    };
    this.el.querySelector('.wallet-pub-copy').onclick = async function(){
      try { await navigator.clipboard.writeText(pubEl.dataset.full || ''); say('Public key copied', 'ok'); }
      catch(e){ say('Copy blocked — your public key is ' + (pubEl.dataset.full || ''), null); }
    };
    this.el.querySelector('.wallet-copy').onclick = async function(){
      try { await navigator.clipboard.writeText(input.value.trim()); say('Private key copied — store it somewhere safe, and don’t share it', 'ok'); }
      catch(e){ input.type = 'text'; input.select(); say('Press Ctrl/Cmd+C to copy', null); }
    };

    this.el.querySelector('.wallet-save').onclick = async function(){
      var box = self.el.querySelector('.wallet-new');
      var k = box.value.trim().toLowerCase();
      if (k === input.value.trim()){ say('That is already this browser’s key', 'err'); return; }
      try { await riffWallet.use(k); }
      catch(e){ say(e.message, 'err'); return; }
      box.value = '';
      await showKeys();
      say('Done — this browser now uses that wallet', 'ok');
      self.refresh();
      if (window.promoBoss) promoBoss.refresh();
    };
  },

  status(msg, kind){
    var el = this.el.querySelector('.mine-status');
    el.textContent = msg || '';
    el.className = 'status-bar mine-status' + (kind ? ' ' + kind : '');
  },

  async refresh(){
    try {
      var w = await this.wallet();
      var r = await fetch('/api/wallet', { headers: await riffWallet.headers() });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var d = await r.json();
      this.el.querySelector('.mine-bal').textContent = d.balance;
      // no "/ cap" any more: there is no daily cap, and printing one that
      // does not exist is worse than printing nothing
      this.el.querySelector('.mine-today').textContent = d.mined_today;
      this.el.querySelector('.mt-earned b').textContent = d.earned != null ? d.earned : '–';
      this.el.querySelector('.mt-spent b').textContent = d.spent != null ? d.spent : '–';
      this.renderDifficulty(d);
      this.renderContrib(d.contrib);
      this._promoteCost = d.promote_cost;
      this.renderLedger();
      return d;
    } catch(e){
      this.status('Wallet unavailable: ' + e.message, 'err');
      return null;
    }
  },

  /* Why your next token costs what it costs.
     Difficulty is no longer a constant: it rises when the whole site is
     minting faster than the target, and it is permanently lower if you
     were here early. Both of those are only fair if you can see them, so
     the arithmetic is shown rather than just the result. */
  renderDifficulty(d){
    var diff = this.el.querySelector('.mine-diff');
    var tierEl = this.el.querySelector('.mine-tier');
    if (!diff) return;
    if (d.difficulty_bits == null){ diff.textContent = ''; return; }

    var secs = Math.pow(2, d.difficulty_bits) / 15800;   // measured hash rate
    var cost = secs < 90 ? Math.round(secs) + 's'
             : Math.round(secs / 60) + ' min';
    var bits = [];
    if (d.retarget_bits > 0) bits.push('+' + d.retarget_bits + ' demand');
    if (d.tier_discount > 0) bits.push('−' + d.tier_discount + ' early');
    diff.textContent = 'difficulty ' + d.difficulty_bits + ' bits ≈ ' + cost +
      ' per token' + (bits.length ? ' (' + bits.join(', ') + ')' : '');

    var why = 'Base ' + d.base_bits + ' bits.';
    if (d.retarget_bits > 0){
      why += ' +' + d.retarget_bits + ' because the site is minting ' +
        d.mint_rate_per_hour + '/hour against a target of ' + d.mint_target_per_hour + '.';
    } else if (d.mint_target_per_hour){
      why += ' The site is minting ' + d.mint_rate_per_hour + '/hour, target ' +
        d.mint_target_per_hour + ', so nothing is added.';
    }
    if (d.tier_discount > 0){
      why += ' −' + d.tier_discount + ' for good: you were wallet #' + d.joined + '.';
    }
    diff.title = why;

    if (tierEl){
      tierEl.textContent = d.tier ? ' · early user, tier ' + d.tier : '';
      tierEl.title = d.tier
        ? 'You joined early (wallet #' + d.joined + '), so your mining is ' +
          Math.pow(2, d.tier_discount) + '× cheaper than a new wallet’s, permanently.'
        : '';
    }
  },

  /* ── what you have earned by contributing ────────────────────────────
     Contribution rewards are a share of a fixed pool, not a payment per
     contribution, so a points total on its own would be a promise
     riffrolled cannot keep: what it is worth depends on what everybody
     else contributed in the same period. The denominator is shown for
     that reason, and the figure is called an estimate because it is one
     until the period closes. */
  renderContrib(c){
    var box = this.el.querySelector('.mine-contrib');
    if (!box) return;
    if (!c){ box.innerHTML = ''; return; }          // rewards switched off

    if (!c.points){
      box.innerHTML = "<div class='mc-none'>Add a track nobody has added yet, or link two tracks, "
        + "and you share this period's pool of " + Number(c.pool) + " credits.</div>";
      return;
    }

    var atCap = c.points >= c.cap;
    box.innerHTML =
      "<div class='mc-head'>Contributed this period</div>"
      + "<div class='mc-row'>"
        + "<span class='mc-pts'>" + c.points + " / " + c.total_points + " points</span>"
        + "<span class='mc-est' title='A share of " + Number(c.pool)
          + " credits, split by points. It moves as other people contribute.'>"
          + "≈ " + Number(c.projected) + " credits</span>"
      + "</div>"
      + "<div class='mc-note'>"
        + (atCap
            ? "You have hit this period's ceiling of " + c.cap + " points. "
            : "")
        + "Shared with " + c.contributors + " contributor"
        + (c.contributors === 1 ? '' : 's') + " — paid when the period ends."
      + "</div>";
  },

  /* what actually happened to the tokens — mining credits and promotion
     spends, newest first, so the balance is never a mystery number */
  async renderLedger(){
    var box = this.el.querySelector('.mine-ledger');
    if (!box) return;
    try {
      var w = await riffWallet.get();
      var r = await fetch('/api/ledger', { headers: await riffWallet.headers() });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var rows = await r.json();
      if (!rows.length){
        box.innerHTML = "<div class='empty mine-empty'>Nothing yet — start mining above.</div>";
        return;
      }
      var LABEL = { mine:'Mined', promote:'Promoted a track', promote_extend:'Added credits' };
      box.innerHTML = rows.slice(0, 12).map(function(x){
        var up = x.delta > 0;
        var when = new Date(x.created_at);
        var ago = isNaN(when) ? '' : (function(){
          var s = Math.max(0, (Date.now() - when.getTime()) / 1000);
          if (s < 90) return 'just now';
          if (s < 5400) return Math.round(s / 60) + 'm ago';
          if (s < 172800) return Math.round(s / 3600) + 'h ago';
          return Math.round(s / 86400) + 'd ago';
        })();
        return "<div class='led-row'>"
          + "<span class='led-delta " + (up ? 'up' : 'down') + "'>" + (up ? '+' : '') + Number(x.delta || 0) + "</span>"
          + "<span class='led-what'>" + escapeHtml(LABEL[x.reason] || x.reason) + "</span>"
          + "<span class='led-when'>" + ago + "</span></div>";
      }).join('');
    } catch(e){
      box.innerHTML = "<div class='empty mine-empty'>Couldn't load activity</div>";
    }
  },

  // inline Web Worker: batches of SHA-256 attempts, reports rate, returns a hit
  workerUrl(){
    if (this._wurl) return this._wurl;
    var src =
      "onmessage=async function(e){" +
        "var c=e.data.challenge,bits=e.data.bits,enc=new TextEncoder(),n=0,t0=Date.now();" +
        "function lz(u){var b=0;for(var i=0;i<u.length;i++){var v=u[i];if(v===0){b+=8;continue}while((v&128)===0){b++;v=(v<<1)&255}break}return b}" +
        "while(true){" +
          "var nonce=(Math.random()*1e17>>>0).toString(36)+n.toString(36);" +
          "var d=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(c+':'+nonce)));" +
          "if(lz(d)>=bits){postMessage({found:nonce,attempts:n});return}" +
          "n++;" +
          "if(n%2000===0){postMessage({attempts:n,rate:Math.round(n/((Date.now()-t0)/1000))});" +
            "await new Promise(function(r){setTimeout(r,0)})}" +
        "}" +
      "};";
    this._wurl = URL.createObjectURL(new Blob([src], { type:'text/javascript' }));
    return this._wurl;
  },

  async start(){
    this.running = true;
    this.el.querySelector('.mine-toggle').textContent = '⏹ Stop mining';
    this.status('Requesting challenge…');
    this.round();
  },

  stop(){
    this.running = false;
    if (this._worker){ this._worker.terminate(); this._worker = null; }
    this.el.querySelector('.mine-toggle').textContent = '⛏ Start mining';
    this.el.querySelector('.mine-rate').textContent = '';
    this.status('Stopped');
  },

  async round(){
    if (!this.running) return;
    var self = this;
    try {
      var w = await this.wallet();
      var cr = await fetch('/api/mine/challenge', { method:'POST',
        headers:{ 'content-type':'application/json' }, body: JSON.stringify({ wallet: w }) });
      /* The 429 "daily cap reached" branch is gone with the cap. A 429
         from here now means rate limiting at the edge, which is worth
         retrying rather than stopping for the day. */
      if (cr.status === 429){
        this.status('Slow down a moment — retrying…', 'ok');
        if (this.running) setTimeout(function(){ self.round(); }, 5000);
        return;
      }
      if (!cr.ok) throw new Error('HTTP ' + cr.status);
      var ch = await cr.json();
      this.status('Mining at difficulty ' + ch.difficulty_bits +
        (ch.tier_discount > 0 ? ' (−' + ch.tier_discount + ', early user)' : '') + '…');

      if (this._worker) this._worker.terminate();
      this._worker = new Worker(this.workerUrl());
      this._worker.onmessage = async function(e){
        if (e.data.rate) self.el.querySelector('.mine-rate').textContent =
          e.data.rate.toLocaleString() + ' hashes/s · ' + e.data.attempts.toLocaleString() + ' tried';
        if (!e.data.found) return;
        self._worker.terminate(); self._worker = null;
        try {
          var sr = await fetch('/api/mine/submit', { method:'POST',
            headers:{ 'content-type':'application/json' },
            body: JSON.stringify({ wallet: w, challenge: ch.challenge, nonce: e.data.found }) });
          var sd = await sr.json();
          if (!sr.ok) throw new Error(sd.error || ('HTTP ' + sr.status));
          self.el.querySelector('.mine-bal').textContent = sd.balance;
          self.status('+' + sd.reward + ' riff token ✓', 'ok');
          if (window.riffUsage) riffUsage.count('mine_block');
          self.nudgeBackup();
          await self.refresh();
          if (window.promoBoss) promoBoss.refresh();
        } catch(err){ self.status('Submit failed: ' + err.message, 'err'); }
        if (self.running) setTimeout(function(){ self.round(); }, 400);
      };
      this._worker.postMessage({ challenge: ch.challenge, bits: ch.difficulty_bits });
    } catch(e){
      this.status('Mining unavailable: ' + e.message, 'err');
      this.stop();
    }
  }
};

/* ── PROMOTE — spend riff tokens to feature a track in the shared catalogue.
   Separate from mining on purpose: earning and spending are different jobs.
   Engagement counters are anonymous aggregates on the promotion itself. ── */
var promoBoss = {
  style: 'record',     // how the pop-up card looks: 'record' or 'poster'
  color: '',          // '#rrggbb', or '' for the original colors
  size: 'md',         // how much of the record is picture: 'sm' | 'md' | 'lg'
  hole: 1,            // the spindle hole in the middle: 1 | 0
  genres: [],         // genre targeting for the pop-up: up to 3, empty = whatever is playing

  /* ── the mood picker ─────────────────────────────────────────────────
     The vocabulary comes from /api/config rather than a list in this
     file. It has to be exactly the words the server will accept and
     exactly the words the DJ's own options are tagged with; a third
     hand-kept copy is a third chance for one to drift and for matching
     to quietly stop working with no error anywhere. ── */

  tags: [],                 // what the promoter picked, in pick order
  UI_MAX_TAGS: 4,           // guidance; the server's hard cap is higher

  async renderTags(){
    var grid = this.el.querySelector('.promo-tag-grid');
    if (!grid) return;
    var vocab = [];
    try {
      var r = await fetch('/api/config');
      if (r.ok) vocab = (await r.json()).TAGS || [];
    } catch(e){ /* offline */ }

    if (!vocab.length){
      /* No vocabulary means no honest picker. Hiding AI placement is
         better than offering a campaign that would be billed for and
         matched to nothing. */
      grid.innerHTML = "<span class='promo-tag-fail'>Moods unavailable — try again in a moment.</span>";
      this._vocab = [];
      this.syncTags();
      return;
    }
    this._vocab = vocab;
    grid.innerHTML = vocab.map(function(t){
      return "<button type='button' class='promo-tag-btn' data-t='" + escapeHtml(t) + "'>" +
        escapeHtml(t) + "</button>";
    }).join('');
    this.syncTags();
  },

  toggleTag(t){
    var i = this.tags.indexOf(t);
    if (i >= 0) this.tags.splice(i, 1);
    else {
      if (this.tags.length >= this.UI_MAX_TAGS){
        this.status('Four moods is plenty — a track tagged with everything is matched less often, not more', 'warn');
        return;
      }
      this.tags.push(t);
    }
    this.syncTags();
  },

  syncTags(){
    var box = this.el.querySelector('.promo-tags');
    var ai = this.el.querySelector('.promo-mode-ai');
    if (!box || !ai) return;
    box.hidden = !ai.checked;

    var self = this;
    this.el.querySelectorAll('.promo-tag-btn').forEach(function(b){
      var on = self.tags.indexOf(b.dataset.t) >= 0;
      b.classList.toggle('on', on);
      // a full picker should look full rather than silently refuse
      b.classList.toggle('maxed', !on && self.tags.length >= self.UI_MAX_TAGS);
    });

    var count = this.el.querySelector('.promo-tags-count');
    if (count){
      count.textContent = this.tags.length
        ? this.tags.join(' · ')
        : 'Pick at least one — the DJ cannot offer an untagged track to anything.';
      count.classList.toggle('empty', !this.tags.length);
    }
    this.drawPreviews();
  },

  sel: null,          // { ytId, name, inCatalogue }

  /* ── the Promote panel, in the order a person decides things ─────────
     1 which track · 2 where it shows up (each with a picture of what that
     looks like) · 3 which moods, only if the DJ is involved · 4 how many
     credits. "Your promotions" is a second window of its own, so the form
     is not sitting on top of a list it has nothing to do with. */
  thumb(id){ return 'https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/mqdefault.jpg'; },

  setup(){
    var main =
      "<div class='sec promo-wiz'>" +
        "<div class='promo-hero'>" +
          "<img class='promo-poster' src='img/promote-poster.webp' alt='' width='62' height='86' draggable='false'>" +
          "<div class='promo-hero-txt'>" +
            "<div class='promo-hero-t'>Get a track heard</div>" +
            "<div class='promo-wallet'><span class='promo-bal'>–</span> credits · 1 credit = one person's attention</div>" +
            "<button type='button' class='promo-mine-open' title='See how your promotions are doing'>Your promotions<span class='promo-mine-n'></span></button>" +
          "</div>" +
        "</div>" +

        "<div class='promo-step'>" +
          "<div class='promo-step-h'><span class='promo-n'>1</span>Pick a track</div>" +
          "<div class='row promo-find'>" +
            "<input type='text' class='promo-srh' placeholder='Search, or paste a link…'>" +
            "<button type='button' class='promo-usecur' title='Use the track playing now'>💿 Playing now</button>" +
          "</div>" +
          "<div class='promo-results'></div>" +
          "<div class='promo-pick'>Nothing selected yet.</div>" +
        "</div>" +

        "<div class='promo-step'>" +
          "<div class='promo-step-h'><span class='promo-n'>2</span>Where should it appear?</div>" +
          "<div class='promo-modes'>" +
            "<label class='promo-mode'><input type='checkbox' class='promo-mode-popup' checked>" +
              "<span class='pm-t'>Pop-up ad</span>" +
              "<span class='pm-d'>A spinning record or a gig poster (you choose below) appears in the corner while someone listens, with your track's picture on it. Hover it for Play and Add. Always marked “Promoted”.</span>" +
              "<span class='pv pv-pop' aria-hidden='true'></span>" +
            "</label>" +
            "<label class='promo-mode'><input type='checkbox' class='promo-mode-ai'>" +
              "<span class='pm-t'>AI playlists</span>" +
              "<span class='pm-d'>Offered to someone's AI when they build a DJ brief — only if they switched on “Allow promotional tracks” and your moods fit what they asked for. Their AI decides whether to use it.</span>" +
              "<span class='pv pv-ai' aria-hidden='true'>" +
                "<span class='pv-ai-h'>PROMOTED TRACKS</span>" +
                "<span class='pv-ai-l'><b class='pv-name'>Your track</b></span>" +
                "<span class='pv-ai-l dim'>tagged: <span class='pv-tags'>pick moods below</span></span>" +
              "</span>" +
            "</label>" +
          "</div>" +
          /* the real card, drawn by the same code that draws it for
             listeners, so what is previewed is what is shown */
          "<div class='promo-live' hidden>" +
            "<div class='promo-live-h'>Choose a style</div>" +
            "<div class='promo-looks'>" +
              "<label class='promo-look on'><input type='radio' name='promo-style' value='record' checked>" +
                "<span class='promo-look-stage' data-style='record'></span><b>Record</b></label>" +
              "<label class='promo-look'><input type='radio' name='promo-style' value='poster'>" +
                "<span class='promo-look-stage' data-style='poster'></span><b>Poster</b></label>" +
            "</div>" +
            "<div class='promo-size-wrap'>" +
              "<div class='promo-live-h'>How much picture?</div>" +
              "<div class='promo-sizes' role='radiogroup' aria-label='How much of the record is picture' data-testid='promo-sizes'></div>" +
              "<div class='promo-live-h'>Hole in the middle?</div>" +
              "<div class='promo-sizes promo-holes' role='radiogroup' aria-label='Hole in the middle' data-testid='promo-holes'></div>" +
            "</div>" +
            "<div class='promo-live-h'>Choose a color</div>" +
            "<div class='promo-swatches'></div>" +
            "<div class='promo-color-name'>Classic</div>" +
            "<div class='promo-live-h'>Who should see it? <small>(optional)</small></div>" +
            "<div class='promo-genre-note'>Only while someone is playing one of these genres. Leave them all off to reach anyone. Narrower means it can take longer to spend.</div>" +
            "<div class='promo-genres' data-testid='promo-genres'></div>" +
            "<div class='promo-live-h'>What listeners will see</div>" +
            /* the real card, drawn by the same code that draws it for
               listeners, so what is previewed is what is shown */
            "<div class='promo-pop pp-inline show promo-live-card' aria-label='Preview of your promoted ad'></div>" +
            "<div class='promo-live-note'>Preview only. Hover it to see the buttons. Nobody is shown this and no credits are used. A real one stays on the listener’s screen until they close it (they can move it and resize it), and up to five can be up at once.</div>" +
          "</div>" +
        "</div>" +

        /* the moods are the whole of how a brief finds a track, and mean
           nothing to a pop-up-only campaign, so they appear with the AI
           option and not before */
        "<div class='promo-step promo-tags' hidden>" +
          "<div class='promo-step-h'><span class='promo-n promo-n-tags'>3</span>Which moods does this track suit?</div>" +
          "<div class='promo-tags-note'>Pick up to 4. A brief has to ask for these moods before your track is offered to it — a track tagged with everything is matched less often, not more.</div>" +
          "<div class='promo-tag-grid'></div>" +
          "<div class='promo-tags-count'></div>" +
        "</div>" +

        "<div class='promo-step'>" +
          "<div class='promo-step-h'><span class='promo-n promo-n-credits'>3</span>How many credits?</div>" +
          "<div class='row promo-spend-row'>" +
            "<input type='number' class='promo-tokens' value='10' min='1' step='1'>" +
            "<span class='promo-quick'>" +
              "<button type='button' data-n='5'>5</button><button type='button' data-n='10'>10</button>" +
              "<button type='button' data-n='25'>25</button><button type='button' data-n='50'>50</button>" +
            "</span>" +
            "<span class='promo-dur'></span>" +
          "</div>" +
          "<div class='row promo-name-row'>" +
            "<span class='promo-spend-lbl'>Name</span>" +
            "<input type='text' class='promo-label' maxlength='120' placeholder='Optional — what you’ll call this campaign'>" +
          "</div>" +
        "</div>" +

        "<div class='promo-sum'></div>" +
        "<button class='promo-go'>📣 Start campaign</button>" +
        "<div class='status-bar promo-status'></div>" +
      "</div>" +
      "<p class='info-meta promo-contact'>Questions about promoting? <a href='mailto:hello@riffrolled.com'>hello@riffrolled.com</a></p>";
    this.el = menuB.createMenu('📣 Promote', main);
    menuB.place(this.el, { right:'1120px', top:'120px', width:'340px', maxHeight:'calc(100vh - 140px)' });

    /* …and the second window. It is a panel in its own right (registered
       in the dock without a button of its own), opened from the button
       above and when a campaign starts. */
    var mine =
      "<div class='sec promo-sec'>" +
        "<div class='promo-mine-top'>" +
          "<button type='button' class='promo-new-open'>＋ New promotion</button>" +
          "<span class='promo-wallet-s'><span class='promo-bal'>–</span> credits</span>" +
        "</div>" +
        "<div class='promo-list'></div>" +
        "<div class='status-bar promo-status'></div>" +
      "</div>" +
      // finished campaigns live here, read from the local archive rather
      // than the API — see renderArchive()
      "<div class='sec promo-sec promo-archive'></div>";
    this.mine = menuB.createMenu('📣 Your promotions', mine);
    // no dock button means the dock never hides it for us (see Track info)
    this.mine.classList.add('is-hidden');
    menuB.place(this.mine, { right:'760px', top:'160px', width:'330px', maxHeight:'calc(100vh - 180px)' });

    var self = this;
    var srh = this.el.querySelector('.promo-srh');
    srh.addEventListener('input', function(){ clearTimeout(self._t); self._t = setTimeout(function(){ self.search(); }, 200); });
    this.el.querySelector('.promo-usecur').onclick = function(){ self.useCurrent(); };
    this.el.querySelector('.promo-go').onclick = function(){ self.promote(); };
    this.el.querySelector('.promo-mine-open').onclick = function(){ self.openMine(); };
    this.mine.querySelector('.promo-new-open').onclick = function(){ if (window.dock) dock.openPanel(self.el); };

    /* The moods only exist for AI placement, so the block only appears
       when AI placement is ticked. Shown unconditionally it would be a
       required-looking field that does nothing for a pop-up-only campaign. */
    this.el.querySelector('.promo-mode-ai').addEventListener('change', function(){ self.syncTags(); self.summarise(); });
    this.el.querySelector('.promo-mode-popup').addEventListener('change', function(){ self.drawLive(); self.summarise(); });
    this.el.querySelector('.promo-label').addEventListener('input', function(){ self.drawLive(); });
    this.el.querySelectorAll("input[name='promo-style']").forEach(function(r){
      r.addEventListener('change', function(){ if (r.checked) self.setStyle(r.value); });
    });
    this.el.querySelector('.promo-live-card').addEventListener('click', function(e){
      var b = e.target.closest('button'); if (!b) return;
      e.preventDefault();
      self.status('That is only a preview. Listeners get these buttons: Play, Add to their playlist, Close.', 'ok');
    });
    this.el.querySelectorAll('.promo-mode').forEach(function(l){
      var cb = l.querySelector('input');
      var tick = function(){ l.classList.toggle('on', cb.checked); };
      cb.addEventListener('change', tick); tick();
    });
    this.el.querySelector('.promo-tag-grid').addEventListener('click', function(e){
      var b = e.target.closest('.promo-tag-btn'); if (!b) return;
      self.toggleTag(b.dataset.t);
    });
    this.renderTags();
    this.el.querySelector('.promo-tokens').addEventListener('input', function(){ self._touched = true; self.showDuration(); });
    this.el.querySelector('.promo-quick').addEventListener('click', function(e){
      var b = e.target.closest('button'); if (!b) return;
      self.el.querySelector('.promo-tokens').value = b.dataset.n; self.showDuration();
    });
    this.el.querySelector('.promo-pick').addEventListener('click', function(e){
      if (e.target.closest('.promo-change')){ self.clearSel(); srh.focus(); }
    });
    this.mine.querySelector('.promo-list').addEventListener('click', function(e){
      var btn = e.target.closest('.promo-act'); if (!btn || !btn.dataset.a) return;
      var row = btn.closest('.promo-row');
      if (btn.dataset.a === 'topup'){ row.classList.add('topping'); row.querySelector('.promo-add').focus(); self.showAddDur(row); return; }
      if (btn.dataset.a === 'cancel'){ row.classList.remove('topping'); return; }
      if (btn.dataset.a === 'lookopen'){ self.lookEditor(row); return; }
      if (btn.dataset.a === 'lookcancel'){ row.classList.remove('looking'); return; }
      if (btn.dataset.a === 'look'){ self.saveLook(Number(row.dataset.id), btn, row); return; }
      self.action(Number(row.dataset.id), btn.dataset.a, btn, row);
    });
    // live "+N people" preview beside the credits field
    this.mine.querySelector('.promo-list').addEventListener('input', function(e){
      var inp = e.target.closest('.promo-add'); if (!inp) return;
      self.showAddDur(inp.closest('.promo-row'));
    });
    this.el.querySelector('.promo-results').addEventListener('click', function(e){
      var row = e.target.closest('.promo-res'); if (!row) return;
      self.select(row.dataset.yt, row.dataset.name, row.dataset.new !== '1');
      self.el.querySelector('.promo-results').innerHTML = '';
      srh.value = '';
    });
    this.drawPreviews();
    this.summarise();
    this.refresh();
  },

  openMine(){
    if (window.dock && dock.openPanel) dock.openPanel(this.mine);
    else this.mine.classList.remove('is-hidden');
    this.refresh();
  },

  /* What each option will look like, with the chosen track in it. Cheap
     enough to redraw on every change, so nothing has to remember what it
     last drew. */
  /* One small, inert card in a host element (the two style tiles and the
     little picture in the option card). Redrawn only when something it
     shows has changed, so the record keeps turning smoothly. */
  mini(host, id, name, style, color, size, hole){
    if (!host || !window.promoPopup) return;
    hole = hole === 0 ? 0 : 1;
    var key = [id || '', name, style, color, size || 'md', hole].join('|');
    if (host._key === key) return;
    host._key = key;
    var c = host.firstChild;
    if (!c){ c = document.createElement('div'); host.appendChild(c); }
    c.className = 'promo-pop pp-mini show';
    c.innerHTML = promoPopup.markup(id || '', name, style);
    promoPopup.dress(c, style, color, size, hole);
    var im = c.querySelector('.pp-art');
    if (im && !id){ im.removeAttribute('src'); im.style.visibility = 'hidden'; }
  },

  /* The style and color choices, and the actual listener-facing card inside
     this window. Shown only while the pop-up option is ticked, and inert:
     its buttons say so instead of doing anything. */
  drawLive(){
    var el = this.el, box = el.querySelector('.promo-live');
    if (!box) return;
    var pop = el.querySelector('.promo-mode-popup');
    var card = box.querySelector('.promo-live-card');
    var id = this.sel && this.sel.ytId;
    var lab = el.querySelector('.promo-label');
    var name = ((lab && lab.value || '').trim()) || (this.sel ? this.sel.name : 'Your track name');
    var self = this;
    box.hidden = !(pop && pop.checked);
    if (!window.promoPopup) return;

    // the two style tiles, each wearing the chosen color and the picked track
    box.querySelectorAll('.promo-look').forEach(function(l){
      var st = l.querySelector('input').value;
      l.classList.toggle('on', st === self.style);
      l.querySelector('input').checked = (st === self.style);
      self.mini(l.querySelector('.promo-look-stage'), id, name, st, self.color, self.size, self.hole);
    });
    // and the same thing, small, in the option card
    this.mini(el.querySelector('.pv-pop'), id, name, this.style, this.color, this.size, this.hole);
    this.drawGenres();
    this.drawSizes(box.querySelector('.promo-sizes:not(.promo-holes)'), this.style, this.size, id, name, this.color, function(v){ self.setSize(v); }, this.hole);
    this.drawHoles(box.querySelector('.promo-holes'), this.hole, id, name, this.color, this.size, function(v){ self.hole = v; self.drawLive(); });
    box.querySelector('.promo-size-wrap').hidden = this.style === 'poster';

    // swatches: built once, then only their selected state changes
    var sw = box.querySelector('.promo-swatches');
    if (!sw.firstChild) this.buildSwatches(sw);
    var pal = null;
    sw.querySelectorAll('.promo-sw').forEach(function(b){
      var on = b.classList.contains('promo-sw-custom') ? (self.color && !self.isPalette(self.color)) : (b.dataset.color === self.color);
      b.classList.toggle('on', !!on);
      if (b.getAttribute('role') === 'radio') b.setAttribute('aria-checked', on ? 'true' : 'false');
      if (on && !b.classList.contains('promo-sw-custom')) pal = b.dataset.name;
    });
    box.querySelector('.promo-color-name').textContent = !this.color ? 'Classic (the original colors)' : (pal || ('Custom ' + this.color));

    var key = [id || '', name, this.style, this.color, this.size, this.hole].join('|');
    if (card._key === key) return;                    // nothing changed: do not restart the spin
    card._key = key;
    card.innerHTML = promoPopup.markup(id || '', name, this.style);
    promoPopup.dress(card, this.style, this.color, this.size, this.hole);
    if (!id){ var im = card.querySelector('.pp-art'); if (im){ im.removeAttribute('src'); im.style.visibility = 'hidden'; } }
  },

  isPalette(c){
    return promoPopup.PALETTES.some(function(p){ return p.color === c; });
  },

  buildSwatches(sw){
    var self = this;
    promoPopup.PALETTES.forEach(function(p){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'promo-sw' + (p.color ? '' : ' promo-sw-classic');
      b.dataset.color = p.color; b.dataset.name = p.name;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', p.name); b.title = p.name;
      if (p.color) b.style.background = p.color;
      b.addEventListener('click', function(){ self.setColor(p.color); });
      sw.appendChild(b);
    });
    // anything at all: the browser's own color picker
    var c = document.createElement('label');
    c.className = 'promo-sw promo-sw-custom'; c.title = 'Pick any color';
    var inp = document.createElement('input');
    inp.type = 'color'; inp.className = 'promo-color'; inp.value = '#ff8a3d';
    inp.setAttribute('aria-label', 'Pick any color');
    inp.addEventListener('input', function(){ self.setColor(inp.value.toLowerCase()); });
    c.appendChild(inp);
    sw.appendChild(c);
  },

  /* Genre targeting chips: the closed genre list, up to three. */
  drawGenres(){
    var box = this.el.querySelector('.promo-genres');
    if (!box) return;
    var self = this, list = (window.riffGenres && riffGenres.LIST) || [];
    if (!box.firstChild){
      box.innerHTML = list.map(function(g){
        return "<button type='button' class='promo-genre-btn' data-g='" + escapeHtml(g) + "'>" + escapeHtml(g) + "</button>";
      }).join('');
      box.addEventListener('click', function(e){
        var b = e.target.closest('.promo-genre-btn'); if (!b) return;
        var g = b.dataset.g, i = self.genres.indexOf(g);
        if (i >= 0) self.genres.splice(i, 1);
        else if (self.genres.length < 3) self.genres.push(g);
        else { self.status('Up to three genres', 'err'); return; }
        self.drawGenres(); self.summarise();
      });
    }
    box.querySelectorAll('.promo-genre-btn').forEach(function(b){
      var on = self.genres.indexOf(b.dataset.g) >= 0;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  },

  setStyle(st){
    this.style = (st === 'poster') ? 'poster' : 'record';
    this.drawLive();
  },

  setSize(v){
    this.size = (v === 'sm' || v === 'lg') ? v : 'md';
    this.drawLive();
  },

  /* The three label sizes as small live records, each with the picked
     track and color. Used by the form and by the look editor. */
  drawSizes(box, style, size, id, name, color, pick, hole){
    if (!box || !window.promoPopup) return;
    var self = this;
    if (!box.firstChild){
      box.innerHTML = promoPopup.SIZES.map(function(z){
        return "<button type='button' class='promo-size' role='radio' data-size='" + z.id + "' data-testid='promo-size-" + z.id + "'>"
          + "<span class='promo-size-stage'></span><b>" + escapeHtml(z.name) + "</b></button>";
      }).join('');
      box.addEventListener('click', function(e){
        var b = e.target.closest('.promo-size'); if (b && box._pick) box._pick(b.dataset.size);
      });
    }
    box._pick = pick;
    box.querySelectorAll('.promo-size').forEach(function(b){
      var on = b.dataset.size === size;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
      self.mini(b.querySelector('.promo-size-stage'), id, name, 'record', color, b.dataset.size, hole);
    });
  },

  /* With or without the hole in the middle: two small live records. */
  drawHoles(box, hole, id, name, color, size, pick){
    if (!box || !window.promoPopup) return;
    var self = this;
    if (!box.firstChild){
      box.innerHTML = [['1', 'Hole'], ['0', 'No hole']].map(function(z){
        return "<button type='button' class='promo-size promo-hole' role='radio' data-hole='" + z[0] + "' data-testid='promo-hole-" + z[0] + "'>"
          + "<span class='promo-size-stage'></span><b>" + z[1] + "</b></button>";
      }).join('');
      box.addEventListener('click', function(e){
        var b = e.target.closest('.promo-hole'); if (b && box._pick) box._pick(Number(b.dataset.hole));
      });
    }
    box._pick = pick;
    box.querySelectorAll('.promo-hole').forEach(function(b){
      var on = Number(b.dataset.hole) === (hole === 0 ? 0 : 1);
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
      self.mini(b.querySelector('.promo-size-stage'), id, name, 'record', color, size, Number(b.dataset.hole));
    });
  },

  setColor(c){
    this.color = /^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : '';
    this.drawLive();
  },

  drawPreviews(){
    var el = this.el;
    var nm = el.querySelector('.pv-name');
    if (nm) nm.textContent = this.sel ? this.sel.name : 'Your track';
    this.drawLive();
    var tg = el.querySelector('.pv-tags');
    if (tg) tg.textContent = this.tags.length ? this.tags.join(', ') : 'pick moods below';
  },

  clearSel(){
    this.sel = null;
    this.renderPick();
    this.drawPreviews();
    this.summarise();
  },

  renderPick(){
    var box = this.el.querySelector('.promo-pick');
    if (!this.sel){ box.textContent = 'Nothing selected yet.'; box.classList.remove('has'); return; }
    box.classList.add('has');
    box.innerHTML =
      "<img class='pr-th' alt='' src='" + this.thumb(this.sel.ytId) + "'>" +
      "<span class='pr-txt'><span class='promo-pick-lbl'>Promoting</span><span class='pr-name'>" + escapeHtml(this.sel.name) + "</span>" +
        (this.sel.inCatalogue ? '' : "<span class='promo-new'>will be added to the catalogue</span>") + "</span>" +
      "<button type='button' class='promo-change'>Change</button>";
  },

  /* One plain sentence about what pressing the button does, so the cost
     is never a surprise. */
  summarise(){
    var box = this.el.querySelector('.promo-sum');
    if (!box) return;
    var n = parseInt(this.el.querySelector('.promo-tokens').value, 10) || 0;
    var ai = this.el.querySelector('.promo-mode-ai').checked;
    var pop = this.el.querySelector('.promo-mode-popup').checked;
    var num = this.el.querySelector('.promo-n-credits'); if (num) num.textContent = ai ? '4' : '3';
    var where = pop && ai ? 'pop-up ads and DJ briefs' : ai ? 'DJ briefs' : pop ? 'pop-up ads' : 'nowhere yet';
    if (pop && this.genres.length) where += ' (pop-ups only while ' + this.genres.join(', ') + ' plays)';
    var left = typeof this._balance === 'number' ? this._balance - n : null;
    box.textContent = n > 0
      ? 'Costs ' + n + (n === 1 ? ' credit' : ' credits') + ' · shown to ' + n + (n === 1 ? ' person' : ' people') + ' in ' + where +
        (left !== null ? (left >= 0 ? ' · ' + left + ' left after' : ' · you only have ' + this._balance) : '')
      : '';
    box.classList.toggle('low', left !== null && left < 0);
  },

  status(msg, kind){
    var els = [this.el.querySelector('.promo-status'), this.mine && this.mine.querySelector('.promo-status')];
    els.forEach(function(el){
      if (!el) return;
      el.textContent = msg || '';
      el.className = 'status-bar promo-status' + (kind ? ' ' + kind : '');
    });
    var self = this, first = els[0];
    if (msg && kind === 'ok'){ clearTimeout(this._st); this._st = setTimeout(function(){ if (first.textContent === msg) self.status(''); }, 7000); }
  },

  idFromUrl(u){
    var m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(u)
         || /youtu\.be\/([A-Za-z0-9_-]{11})/.exec(u)
         || /\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})/.exec(u)
         || /^([A-Za-z0-9_-]{11})$/.exec(String(u).trim());
    return m ? m[1] : null;
  },

  select(ytId, name, inCatalogue){
    this.sel = { ytId: ytId, name: name, inCatalogue: inCatalogue !== false };
    this.renderPick();
    this.drawPreviews();
    this.summarise();
  },

  useCurrent(){
    if (!player.currentYtId){ this.status('Nothing is playing right now', 'err'); return; }
    var name = player.el.title ? player.el.title.textContent : player.currentYtId;
    this.select(player.currentYtId, name, true);
  },

  // typing a link offers it directly; anything else searches the shared catalogue
  async search(){
    var q = (this.el.querySelector('.promo-srh').value || '').trim();
    var box = this.el.querySelector('.promo-results');
    if (!q){ box.innerHTML = ''; return; }

    var vid = this.idFromUrl(q);
    if (vid){
      var title = 'Video ' + vid;
      try {   // free, keyless title lookup
        var o = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + vid) + '&format=json');
        if (o.ok){ var od = await o.json(); if (od.title) title = od.title; }
      } catch(e){}
      box.innerHTML = "<div class='promo-res' data-yt='" + escapeHtml(vid) + "' data-name='" + escapeHtml(title) + "' data-new='1'>"
        + "<img class='pr-th' alt='' loading='lazy' src='" + this.thumb(vid) + "'>"
        + "<span class='name'>" + escapeHtml(title) + "</span><span class='promo-new'>from link</span></div>";
      return;
    }

    try {
      var r = await fetch('/api/search?q=' + encodeURIComponent(q) + '&limit=15&source=db');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var list = await r.json();
      var self = this;
      if (!list.length){ box.innerHTML = "<div class='empty'>Nothing in the catalogue — paste a link instead</div>"; return; }
      box.innerHTML = list.map(function(t){
        var id = self.idFromUrl(t.url || '');
        if (!id) return '';
        return "<div class='promo-res' data-yt='" + escapeHtml(id) + "' data-name='" + escapeHtml(t.name || id) + "'>"
          + "<img class='pr-th' alt='' loading='lazy' src='" + self.thumb(id) + "'>"
          + "<span class='name'>" + escapeHtml(t.name || id) + (t.artist ? "<span class='pr-art'>" + escapeHtml(t.artist) + "</span>" : '') + "</span></div>";
      }).join('');
    } catch(e){
      box.innerHTML = '';
      this.status('Search unavailable: ' + e.message, 'err');
    }
  },

  /* Credits are impressions now, not hours, so there is no duration to
     preview — just say plainly what the number buys. */
  showDuration(){
    var n = parseInt(this.el.querySelector('.promo-tokens').value, 10) || 0;
    var el = this.el.querySelector('.promo-dur');
    el.textContent = n > 0 ? (n === 1 ? '= 1 person' : '= ' + n + ' people') : '';
    this.summarise();
  },

  _showDurationOld(){
    var n = parseInt(this.el.querySelector('.promo-tokens').value, 10) || 0;
    var cost = this._cost || 5, hrs = this._hours || 24;
    var el = this.el.querySelector('.promo-dur');
    if (n < cost){ el.textContent = 'min ' + cost; el.className = 'promo-dur low'; return; }
    var total = hrs * (n / cost);
    el.className = 'promo-dur';
    el.textContent = total >= 48 ? ('≈ ' + Math.round(total / 24) + ' days') : ('≈ ' + Math.round(total) + 'h');
  },

  async promote(){
    if (!this.sel){ this.status('Pick a track first — search, paste a link, or hit 💿', 'err'); return; }
    var tokens = parseInt(this.el.querySelector('.promo-tokens').value, 10) || 0;
    var btn = this.el.querySelector('.promo-go');
    btn.disabled = true;
    this.status('Promoting…');
    try {
      var w = await riffWallet.get();
      var url = 'https://www.youtube.com/watch?v=' + this.sel.ytId;
      // a track pasted as a link may not be in the catalogue yet — add it first
      // (a plain database write; the YouTube API isn't involved)
      if (!this.sel.inCatalogue){
        await fetch('/api/track', { method:'POST', headers:{ 'content-type':'application/json' },
          body: JSON.stringify({ name: this.sel.name, url: url }) });
      }
      var modes = [];
      if (this.el.querySelector('.promo-mode-popup').checked) modes.push('popup');
      if (this.el.querySelector('.promo-mode-ai').checked) modes.push('ai');
      if (!modes.length){ this.status('Choose at least one way to promote', 'err'); return; }

      /* Caught here as well as on the server. The server refuses an
         untagged AI campaign because taking the money for one that can
         match nothing would be worse than a 400 — but being told before
         pressing the button is better than being told after. */
      if (modes.indexOf('ai') >= 0 && !this.tags.length){
        this.status('Pick at least one mood so the DJ knows which briefs this track suits', 'err');
        this.syncTags();
        return;
      }

      var r = await fetch('/api/promote', { method:'POST', headers:{ 'content-type':'application/json' },
        body: JSON.stringify({
          wallet: w, url: url, credits: tokens,
          modes: modes.join(','),
          tags: this.tags,
          style: this.style, color: this.color, size: this.style === 'poster' ? 'md' : this.size, hole: this.style === 'poster' ? 1 : this.hole,
          genres: this.el.querySelector('.promo-mode-popup').checked ? this.genres.slice() : [],
          label: (this.el.querySelector('.promo-label').value || '').trim() || this.sel.name,
        }) });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
      if (window.riffUsage) riffUsage.count('promote_start');
      this.status(d.held
        ? 'Reserved ' + d.credits + ' credits (' + d.balance + ' left). The first promotion from each key gets a quick check by a person before anyone sees it — after that, yours go straight up.'
        : d.credits + ' credits ✓ — that many people will see it. ' + d.balance + ' left.', 'ok');
      this.el.querySelector('.promo-label').value = '';
      this.tags = [];              // the next campaign is a different track
      this.genres = []; this.drawGenres();
      this.syncTags();
      this.sel = null;
      this.renderPick();
      this.drawPreviews();
      await this.refresh();
      this.openMine();             // so you can watch it start working
      if (window.mineBoss) mineBoss.refresh();
      if (window.promoTrack) promoTrack.refresh();
      if (window.dataBoss && dataBoss.el && !dataBoss.el.classList.contains('is-hidden')) dataBoss.run();
    } catch(e){
      this.status(e.message, 'err');
    } finally {
      btn.disabled = false;
    }
  },

  showAddDur(row){
    var inp = row && row.querySelector('.promo-add');
    var out = row && row.querySelector('.promo-add-dur');
    if (!inp || !out) return;
    var n = parseInt(inp.value, 10) || 0;
    out.textContent = n > 0 ? '+' + n + (n === 1 ? ' person' : ' people') : '';
    return;
  },

  _showAddDurOld(row){
    var n = parseInt(row.querySelector('.promo-add').value, 10) || 0;
    var cost = this._cost || 5, hrs = this._hours || 24;
    var el = row.querySelector('.promo-add-dur');
    el.textContent = n > 0 ? ('+' + Math.round(hrs * (n / cost)) + 'h') : '';
  },

  /* Change a running campaign's look: Record or Poster, and a color. A
     small live preview of the real card, the same swatches as the form. */
  lookEditor(row){
    var box = row.querySelector('.promo-look-row'), self = this;
    if (row.classList.contains('looking')){ row.classList.remove('looking'); return; }
    row.classList.add('looking');
    // a fresh box each time, so listeners from an earlier opening don't pile up
    var fresh = box.cloneNode(false); box.replaceWith(fresh); box = fresh;
    var st = box.dataset.style || 'record', col = box.dataset.color || '', sz = box.dataset.size || 'md', ho = box.dataset.hole === '0' ? 0 : 1;
    box.innerHTML =
      "<div class='pl-look-styles'>" +
        "<button type='button' class='promo-act pl-st' data-st='record'>Record</button>" +
        "<button type='button' class='promo-act pl-st' data-st='poster'>Poster</button>" +
      "</div>" +
      "<div class='promo-sizes pl-sizes' role='radiogroup' aria-label='How much of the record is picture'></div>" +
      "<div class='promo-sizes pl-sizes pl-holes' role='radiogroup' aria-label='Hole in the middle'></div>" +
      "<div class='promo-swatches pl-sw'></div>" +
      "<div class='pl-look-prev'></div>" +
      "<div class='pl-look-btns'><button class='promo-act' data-a='look' data-testid='promo-look-save'>Save look</button>" +
      "<button class='promo-act' data-a='lookcancel'>Cancel</button></div>";
    var sw = box.querySelector('.pl-sw');
    promoPopup.PALETTES.forEach(function(p){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'promo-sw' + (p.color ? '' : ' promo-sw-classic');
      b.dataset.color = p.color; b.title = p.name; b.setAttribute('aria-label', p.name);
      if (p.color) b.style.background = p.color;
      sw.appendChild(b);
    });
    var c = document.createElement('label'); c.className = 'promo-sw promo-sw-custom'; c.title = 'Pick any color';
    var inp = document.createElement('input'); inp.type = 'color'; inp.value = col || '#ff8a3d'; inp.setAttribute('aria-label', 'Pick any color');
    c.appendChild(inp); sw.appendChild(c);
    var draw = function(){
      box.dataset.style = st; box.dataset.color = col; box.dataset.size = sz; box.dataset.hole = String(ho);
      var szBox = box.querySelector('.pl-sizes:not(.pl-holes)'), hoBox = box.querySelector('.pl-holes');
      szBox.hidden = hoBox.hidden = st === 'poster';
      self.drawSizes(szBox, st, sz, row.dataset.yt, row.querySelector('.promo-name').textContent, col, function(v){ sz = v; draw(); }, ho);
      self.drawHoles(hoBox, ho, row.dataset.yt, row.querySelector('.promo-name').textContent, col, sz, function(v){ ho = v; draw(); });
      box.querySelectorAll('.pl-st').forEach(function(b){ b.classList.toggle('on', b.dataset.st === st); });
      sw.querySelectorAll('.promo-sw').forEach(function(b){
        b.classList.toggle('on', b.classList.contains('promo-sw-custom') ? (!!col && !self.isPalette(col)) : b.dataset.color === col);
      });
      var host = box.querySelector('.pl-look-prev');
      host._key = '';
      self.mini(host, row.dataset.yt, row.querySelector('.promo-name').textContent, st, col, sz, ho);
    };
    box.addEventListener('click', function(e){
      var s1 = e.target.closest('.pl-st'); if (s1){ st = s1.dataset.st; draw(); return; }
      var s2 = e.target.closest('.promo-sw:not(.promo-sw-custom)'); if (s2){ col = s2.dataset.color; draw(); }
    });
    inp.addEventListener('input', function(){ col = inp.value.toLowerCase(); draw(); });
    draw();
  },

  async saveLook(id, btn, row){
    var box = row.querySelector('.promo-look-row');
    btn.disabled = true;
    try {
      var w = await riffWallet.get();
      var r = await fetch('/api/promotion/action', { method:'POST', headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ wallet: w, id: id, action: 'look', style: box.dataset.style, color: box.dataset.color, size: box.dataset.style === 'poster' ? 'md' : (box.dataset.size || 'md'), hole: box.dataset.style === 'poster' ? 1 : (box.dataset.hole === '0' ? 0 : 1) }) });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
      this.status('New look saved — the next people to see it get it. No credits used.', 'ok');
      await this.refresh();
    } catch(e){ this.status(e.message, 'err'); }
    finally { btn.disabled = false; }
  },

  /* pause / resume / top up an existing promotion */
  async action(id, act, btn, row){
    var tokens = 0;
    if (act === 'extend'){
      tokens = parseInt(row.querySelector('.promo-add').value, 10) || 0;
      if (tokens <= 0){ this.status('Enter a positive number of credits', 'err'); return; }
    }
    btn.disabled = true;
    this.status(act === 'extend' ? 'Adding credits…' : (act === 'pause' ? 'Pausing…' : 'Resuming…'));
    try {
      var w = await riffWallet.get();
      var r = await fetch('/api/promotion/action', { method:'POST', headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ wallet: w, id: id, action: act, credits: tokens }) });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
      this.status(
        act === 'extend' ? ('Added ' + d.added + ' credits — ' + d.credits_remaining + ' on the campaign, ' + d.balance + ' in your wallet')
        : act === 'pause' ? 'Paused — credits only go when the card is shown, so nothing is lost'
        : 'Resumed ✓', 'ok');
      await this.refresh();
      if (window.mineBoss) mineBoss.refresh();
      if (window.promoTrack) promoTrack.refresh();
      if (window.dataBoss && dataBoss.el && !dataBoss.el.classList.contains('is-hidden')) dataBoss.run();
    } catch(e){
      this.status(e.message, 'err');
    } finally {
      btn.disabled = false;
    }
  },

  // banked time on a paused promotion
  msLeft(ms){
    ms = Number(ms) || 0;
    if (!(ms > 0)) return 'no time left';
    var h = Math.floor(ms / 3600000);
    if (h >= 48) return Math.round(h / 24) + 'd banked';
    return h >= 1 ? (h + 'h banked') : (Math.max(1, Math.round(ms / 60000)) + 'm banked');
  },

  // "3h left" / "ended" from an ISO timestamp
  timeLeft(iso){
    var ms = new Date(iso).getTime() - Date.now();
    if (!(ms > 0)) return 'ended';
    var h = Math.floor(ms / 3600000);
    if (h >= 48) return Math.round(h / 24) + 'd left';
    return h >= 1 ? (h + 'h left') : (Math.max(1, Math.round(ms / 60000)) + 'm left');
  },

  async refresh(){
    var list = this.mine.querySelector('.promo-list');
    try {
      var w = await riffWallet.get();
      try {
        var wr = await fetch('/api/wallet', { headers: await riffWallet.headers() });
        if (wr.ok){
          var wd = await wr.json();
          this._balance = wd.balance;
          this.el.querySelector('.promo-bal').textContent = wd.balance;
          this.mine.querySelector('.promo-bal').textContent = wd.balance;
          // no minimum any more: one credit is a coherent, if small, campaign
          var ti = this.el.querySelector('.promo-tokens');
          ti.min = 1; ti.step = 1;
          this.showDuration();
        }
      } catch(e0){ /* the balance line is cosmetic */ }

      var r = await fetch('/api/promotions/mine', { headers: await riffWallet.headers() });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var rows = await r.json();
      var liveN = rows.filter(function(p){ return Number(p.credits_remaining || 0) > 0; }).length;
      var badge = this.el.querySelector('.promo-mine-n');
      if (badge) badge.textContent = liveN ? ' · ' + liveN + ' live' : '';
      if (!rows.length){
        list.innerHTML = "<div class='empty promo-empty'>Nothing promoted yet.<br>Pick a track in the Promote window and it will show up here.</div>";
        return;
      }
      var self = this;
      list.innerHTML = rows.map(function(p){
        var pid = self.idFromUrl(p.url || '') || '';
        // credits, not the clock, end a campaign now
        var credits = Number(p.credits_remaining || 0);
        var ended = credits <= 0;
        var state = p.held ? 'paused' : p.paused ? 'paused' : (ended ? 'ended' : 'live');
        var left = ended ? 'spent' : (credits + (credits === 1 ? ' credit left' : ' credits left'));
        var heldNote = !p.held ? '' : Number(p.reports || 0) > 0
          ? 'On hold: listeners reported it, so riffrolled will look at it. Your credits are kept.'
          : 'Waiting for a quick check by a person (the first promotion from each key). Your credits are kept.';
        return "<div class='promo-row " + state + "' data-yt='" + escapeHtml(pid) + "' data-id='" + Number(p.id || 0) + "'>"
          + "<div class='promo-name'>" + escapeHtml(p.label || p.name || p.url) + "</div>"
          + (heldNote ? "<div class='promo-held' data-testid='promo-held'>" + escapeHtml(heldNote) + "</div>" : '')
          + (/(^|,)popup(,|$)/.test(p.modes || '')
              ? "<div class='promo-look-chip'>" + (p.style === 'poster' ? 'Poster' : 'Record · ' + ({ sm:'more vinyl', lg:'more picture' }[p.size] || 'balanced') + (p.hole === 0 ? ' · no hole' : ''))
                + (/^#[0-9a-f]{6}$/i.test(p.color || '') ? " <i class='promo-dot' data-c='" + escapeHtml(p.color) + "'></i> " + escapeHtml(p.color) : ' · classic colors')
                + (p.genres ? " · only during " + escapeHtml(String(p.genres).split(',').join(', ')) : '')
                + "</div>" : "")
          + "<div class='promo-stats'>"
            + "<span title='Times shown to people'>👁 " + Number(p.views || 0) + "</span>"
            + "<span title='Plays while promoted'>▶ " + Number(p.plays || 0) + "</span>"
            + "<span title='Likes while promoted'>👍 " + Number(p.likes || 0) + "</span>"
            + "<span title='Dislikes while promoted'>👎 " + Number(p.dislikes || 0) + "</span>"
            + "<span title='Credits spent in total'>⛏ " + Number(p.tokens || 0) + "</span>"
            + "<span class='promo-time' title='Credits left to spend'>" + left + "</span>"
          + "</div>"
          + "<div class='promo-actions'>"
            + (ended ? "" :
                "<button class='promo-act' data-a='" + (p.paused ? 'resume' : 'pause') + "'>"
                + (p.paused ? '▶ Resume' : '❚❚ Pause') + "</button>")
            + "<button class='promo-act promo-topup' data-a='topup'>＋ Add credits</button>"
            + (!ended && /(^|,)popup(,|$)/.test(p.modes || '') ? "<button class='promo-act promo-lookbtn' data-a='lookopen' data-testid='promo-look-open'>🎨 Look</button>" : '')
          + "</div>"
          + "<div class='promo-look-row' data-style='" + (p.style === 'poster' ? 'poster' : 'record') + "' data-size='" + ({ sm:'sm', lg:'lg' }[p.size] || 'md') + "' data-hole='" + (p.hole === 0 ? '0' : '1') + "' data-color='" + escapeHtml(/^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color.toLowerCase() : '') + "'></div>"
          + "<div class='promo-topup-row'>"
            + "<input type='number' class='promo-add' min='1' step='1' value='10'>"
            + "<span class='promo-add-dur'></span>"
            + "<button class='promo-act promo-confirm' data-a='extend'>Add</button>"
            + "<button class='promo-act promo-cancel' data-a='cancel'>✕</button>"
          + "</div></div>";
      }).join('');

      list.querySelectorAll('.promo-dot').forEach(function(d){ d.style.background = d.dataset.c; });

      /* Keep a local copy of anything that has finished. The server
         deletes a spent campaign within a day; these numbers are the
         only record the owner has of what their credits bought, so they
         are copied before that happens rather than after. */
      for (var i = 0; i < rows.length; i++){
        if (Number(rows[i].credits_remaining || 0) <= 0) await dbBoss.archivePromotion(rows[i]);
      }
      await this.renderArchive();
    } catch(e){
      list.innerHTML = '';
      this.status('Couldn’t load your promotions: ' + e.message, 'err');
    }
  },

  /* ── finished campaigns ─────────────────────────────────────────────
     Shown separately from the live list, and from the local archive
     rather than the API, because the whole point is that these outlive
     the server row. A campaign appears here the moment it is spent and
     stays after the sweeper has removed it upstream. */
  async renderArchive(){
    var box = this.mine.querySelector('.promo-archive');
    if (!box) return;
    var rows = await dbBoss.archivedPromotions();
    if (!rows.length){ box.innerHTML = ''; return; }

    var totals = rows.reduce(function(a, r){
      a.credits += r.credits || 0; a.views += r.views || 0;
      a.plays += r.plays || 0; a.likes += r.likes || 0;
      return a;
    }, { credits:0, views:0, plays:0, likes:0 });

    box.innerHTML =
      "<div class='sec-head promo-arch-head'>Finished campaigns"
        + "<button class='promo-export' title='Download every campaign, live and finished, as CSV'>⤓ CSV</button>"
      + "</div>"
      + "<div class='promo-arch-note'>Kept on this device. riffrolled deletes a campaign from the server a day after its last credit goes.</div>"
      + "<div class='promo-arch-tot'>"
        + rows.length + " campaign" + (rows.length === 1 ? '' : 's') + " · "
        + "⛏ " + totals.credits + " credits · 👁 " + totals.views
        + " · ▶ " + totals.plays + " · 👍 " + totals.likes
      + "</div>"
      + rows.slice(0, 40).map(function(r){
          /* Plays per impression, which is the only rate that answers
             "was this worth it". Shown as a percentage of the credits
             actually spent (views), not of the credits bought, because a
             paused campaign has not had its chance yet. */
          var rate = r.views ? Math.round((r.plays / r.views) * 100) : 0;
          return "<div class='promo-arch-row'>"
            + "<span class='promo-arch-name'>" + escapeHtml(r.label || r.name || r.url) + "</span>"
            + "<span class='promo-arch-stats'>👁 " + Number(r.views || 0)
              + " · ▶ " + Number(r.plays || 0)
              + " · 👍 " + Number(r.likes || 0)
              + (r.views ? " · " + rate + "% played" : '')
            + "</span>"
          + "</div>";
        }).join('');

    var self = this;
    box.querySelector('.promo-export').onclick = function(){ self.exportCsv(); };
  },

  /**
   * Every campaign, live and finished, as a CSV file.
   *
   * Built in the browser from the data already on screen rather than from
   * a server endpoint. There is one source of truth that way, and the
   * finished campaigns only exist locally anyway — a server-side export
   * could not include the ones it had already swept, which would make the
   * export quietly incomplete in exactly the case somebody wants it.
   */
  async exportCsv(){
    try {
      var w = await riffWallet.get();
      var live = [];
      try {
        var r = await fetch('/api/promotions/mine', { headers: await riffWallet.headers() });
        if (r.ok) live = await r.json();
      } catch(e){ /* the archive alone is still worth exporting */ }

      var archived = await dbBoss.archivedPromotions();
      var seen = {};
      var all = [];
      live.forEach(function(p){
        seen[p.id] = true;
        all.push({
          id: p.id, name: p.label || p.name || '', url: p.url || '',
          modes: p.modes || '', tags: p.tags || '',
          state: Number(p.credits_remaining || 0) <= 0 ? 'finished' : (p.paused ? 'paused' : 'live'),
          credits_bought: p.tokens || 0, credits_left: p.credits_remaining || 0,
          views: p.views || 0, plays: p.plays || 0, likes: p.likes || 0,
          dislikes: p.dislikes || 0, replays: p.replays || 0,
          created_at: p.created_at || '', ended_at: p.ended_at || '', source: 'server'
        });
      });
      // the ones the server has already deleted
      archived.forEach(function(a){
        if (seen[a.id]) return;
        all.push({
          id: a.id, name: a.label || a.name || '', url: a.url || '',
          modes: a.modes || '', tags: a.tags || '',
          state: 'finished',
          credits_bought: a.credits || 0, credits_left: 0,
          views: a.views || 0, plays: a.plays || 0, likes: a.likes || 0,
          dislikes: a.dislikes || 0, replays: a.replays || 0,
          created_at: a.createdAt || '', ended_at: a.endedAt || '', source: 'local archive'
        });
      });

      if (!all.length){ this.status('Nothing to export yet', 'warn'); return; }

      var cols = ['id','name','url','modes','tags','state','credits_bought','credits_left',
        'views','plays','likes','dislikes','replays','created_at','ended_at','source'];
      var csv = cols.join(',') + '\r\n' + all.map(function(row){
        return cols.map(function(c){ return csvCell(row[c]); }).join(',');
      }).join('\r\n') + '\r\n';

      /* A BOM, because the overwhelmingly likely destination is Excel,
         which reads a UTF-8 CSV as the system codepage without one and
         turns every track title with an accent in it into mojibake. */
      var blob = new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'riffrolled-campaigns-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 5000);
      this.status(all.length + ' campaign' + (all.length === 1 ? '' : 's') + ' exported ✓', 'ok');
    } catch(e){
      this.status('Export failed: ' + e.message, 'err');
    }
  }
};
