/* riffrolled — panels-tokens.js
   The riff economy: the shared wallet key, Mine (hashcash
   proof-of-work), Promote (spend tokens, track engagement). */

/* ── RIFF MINE — hashcash proof-of-work token mining (RPOW spirit).
   The server issues a challenge; a Web Worker grinds SHA-256(challenge:nonce)
   until it has enough leading zero bits; the server verifies with one hash
   and credits the ledger. Wallet = a random bearer key kept in local settings:
   guard it like a password, lose it and the balance is gone. ── */
/* A signal tower rather than a megaphone: this is about reach, not shouting.
   Broadcast arcs radiating from a mast — reads clearly at 20px. */
var PROMOTE_SVG =
  "<svg viewBox='0 0 24 24' aria-hidden='true'>" +
    "<defs><linearGradient id='pmg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ffcc4d'/><stop offset='1' stop-color='#ff8a3d'/></linearGradient></defs>" +
    "<circle cx='12' cy='8' r='2.3' fill='url(#pmg)'/>" +
    "<path d='M12 10.3 L9.6 21 h4.8 Z' fill='url(#pmg)' opacity='0.92'/>" +
    "<path d='M7.6 4.2a7.2 7.2 0 0 0 0 7.6' fill='none' stroke='url(#pmg)' stroke-width='1.7' stroke-linecap='round'/>" +
    "<path d='M16.4 4.2a7.2 7.2 0 0 1 0 7.6' fill='none' stroke='url(#pmg)' stroke-width='1.7' stroke-linecap='round'/>" +
    "<path d='M4.9 1.9a11 11 0 0 0 0 12.2' fill='none' stroke='url(#pmg)' stroke-width='1.5' stroke-linecap='round' opacity='0.55'/>" +
    "<path d='M19.1 1.9a11 11 0 0 1 0 12.2' fill='none' stroke='url(#pmg)' stroke-width='1.5' stroke-linecap='round' opacity='0.55'/>" +
  "</svg>";

/* the anonymous wallet key both mining and promoting sit on top of */
var riffWallet = {
  async get(){
    if (this._w) return this._w;
    let w = await dbBoss.getSetting('wallet');
    if (!w){
      const a = new Uint8Array(32); crypto.getRandomValues(a);
      w = [...a].map(b => b.toString(16).padStart(2, '0')).join('');
      await dbBoss.setSetting('wallet', w);
    }
    this._w = w;
    return w;
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
        "<div class='mine-meta'>mined today: <span class='mine-today'>–</span></div>" +
        "<div class='mine-totals'>" +
          "<span class='mt-earned' title='Tokens mined, all time'>⛏ <b>–</b> earned</span>" +
          "<span class='mt-spent' title='Tokens spent on promotions'>📣 <b>–</b> spent</span>" +
        "</div>" +
        "<div class='row mine-ctl'>" +
          "<button class='icon-btn mine-toggle' title='Start mining'>⛏ Start mining</button>" +
        "</div>" +
        "<div class='mine-meta mine-rate'></div>" +
        "<div class='status-bar mine-status'></div>" +
        "<div class='sec-head mine-hist-head'>Recent activity</div>" +
        "<div class='mine-ledger'></div>" +
        "<div class='mine-note'>Mining burns CPU (and battery on phones). Tokens are spent in the Promote panel — they have no cash value.</div>" +
      "</div>" +
      "<div class='sec wallet-sec'>" +
        "<div class='sec-head'>Wallet key</div>" +
        "<div class='row'>" +
          "<input type='text' class='wallet-key' spellcheck='false' autocomplete='off'>" +
          "<button class='icon-btn wallet-copy' title='Copy'>⧉</button>" +
        "</div>" +
        "<button class='wallet-save'>Use this key on this device</button>" +
        "<div class='wallet-note'>Your tokens belong to this key, not to this browser. Save it somewhere safe: clear this site's data without it and the balance can't be recovered. Anyone holding the key controls the balance.</div>" +
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
    riffWallet.get().then(function(w){ input.value = w; });

    this.el.querySelector('.wallet-copy').onclick = async function(){
      try { await navigator.clipboard.writeText(input.value.trim()); say('Key copied — store it somewhere safe', 'ok'); }
      catch(e){ input.select(); say('Press Ctrl/Cmd+C to copy', null); }
    };

    this.el.querySelector('.wallet-save').onclick = async function(){
      var k = input.value.trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(k)){ say('That is not a valid wallet key (64 hex characters)', 'err'); return; }
      await dbBoss.setSetting('wallet', k);
      riffWallet._w = k;
      say('Wallet key set for this device', 'ok');
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
      var r = await fetch('/api/wallet?wallet=' + w);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var d = await r.json();
      this.el.querySelector('.mine-bal').textContent = d.balance;
      this.el.querySelector('.mine-today').textContent = d.mined_today + ' / ' + d.daily_cap;
      this.el.querySelector('.mt-earned b').textContent = d.earned != null ? d.earned : '–';
      this.el.querySelector('.mt-spent b').textContent = d.spent != null ? d.spent : '–';
      this._promoteCost = d.promote_cost;
      this.renderLedger();
      return d;
    } catch(e){
      this.status('Wallet unavailable: ' + e.message, 'err');
      return null;
    }
  },

  /* what actually happened to the tokens — mining credits and promotion
     spends, newest first, so the balance is never a mystery number */
  async renderLedger(){
    var box = this.el.querySelector('.mine-ledger');
    if (!box) return;
    try {
      var w = await riffWallet.get();
      var r = await fetch('/api/ledger?wallet=' + w);
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
          + "<span class='led-delta " + (up ? 'up' : 'down') + "'>" + (up ? '+' : '') + x.delta + "</span>"
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
      if (cr.status === 429){ this.stop(); this.status('Daily cap reached — back tomorrow ⛏', 'ok'); return; }
      if (!cr.ok) throw new Error('HTTP ' + cr.status);
      var ch = await cr.json();
      this.status('Mining at difficulty ' + ch.difficulty_bits + '…');

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
  sel: null,          // { ytId, name, inCatalogue }

  setup(){
    var main =
      "<div class='sec'>" +
        "<div class='sec-head'>Promote a track</div>" +
        "<div class='promo-wallet'><span class='promo-bal'>–</span> tokens · <span class='promo-cost'>–</span> minimum spend</div>" +
        "<div class='row'>" +
          "<input type='text' class='promo-srh' placeholder='Search the catalogue, or paste a YouTube link…'>" +
          "<button class='icon-btn promo-usecur' title='Use the track playing now'>💿</button>" +
        "</div>" +
        "<div class='promo-results'></div>" +
        "<div class='promo-pick'>Nothing selected yet.</div>" +
        "<div class='row promo-spend-row'>" +
          "<span class='promo-spend-lbl'>Spend</span>" +
          "<input type='number' class='promo-tokens' value='5' min='1' step='1'>" +
          "<span class='promo-dur'></span>" +
        "</div>" +
        "<button class='promo-go'>📣 Promote</button>" +
        "<div class='status-bar promo-status'></div>" +
      "</div>" +
      "<div class='sec promo-sec'>" +
        "<div class='sec-head'>Your promotions</div>" +
        "<div class='promo-list'></div>" +
      "</div>";
    this.el = menuB.createMenu('📣 Promote', main);
    menuB.place(this.el, { right:'1120px', top:'120px', width:'320px' });

    var self = this;
    var srh = this.el.querySelector('.promo-srh');
    srh.addEventListener('input', function(){ clearTimeout(self._t); self._t = setTimeout(function(){ self.search(); }, 200); });
    this.el.querySelector('.promo-usecur').onclick = function(){ self.useCurrent(); };
    this.el.querySelector('.promo-go').onclick = function(){ self.promote(); };
    this.el.querySelector('.promo-tokens').addEventListener('input', function(){ self._touched = true; self.showDuration(); });
    this.el.querySelector('.promo-list').addEventListener('click', function(e){
      var btn = e.target.closest('.promo-act'); if (!btn) return;
      var row = btn.closest('.promo-row');
      if (btn.dataset.a === 'topup'){ row.classList.add('topping'); row.querySelector('.promo-add').focus(); self.showAddDur(row); return; }
      if (btn.dataset.a === 'cancel'){ row.classList.remove('topping'); return; }
      self.action(Number(row.dataset.id), btn.dataset.a, btn, row);
    });
    // live "+Xh" preview beside the token field
    this.el.querySelector('.promo-list').addEventListener('input', function(e){
      var inp = e.target.closest('.promo-add'); if (!inp) return;
      self.showAddDur(inp.closest('.promo-row'));
    });
    this.el.querySelector('.promo-results').addEventListener('click', function(e){
      var row = e.target.closest('.promo-res'); if (!row) return;
      self.select(row.dataset.yt, row.dataset.name, row.dataset.new !== '1');
      self.el.querySelector('.promo-results').innerHTML = '';
      srh.value = '';
    });
    this.refresh();
  },

  status(msg, kind){
    var el = this.el.querySelector('.promo-status');
    el.textContent = msg || '';
    el.className = 'status-bar promo-status' + (kind ? ' ' + kind : '');
    var self = this;
    if (msg && kind === 'ok'){ clearTimeout(this._st); this._st = setTimeout(function(){ if (el.textContent === msg) self.status(''); }, 7000); }
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
    this.el.querySelector('.promo-pick').innerHTML =
      "<span class='promo-pick-lbl'>Promoting</span> " + escapeHtml(name) +
      (this.sel.inCatalogue ? '' : " <span class='promo-new'>· will be added to the catalogue</span>");
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
          + "<span class='name'>" + escapeHtml(t.name || id) + "</span></div>";
      }).join('');
    } catch(e){
      box.innerHTML = '';
      this.status('Search unavailable: ' + e.message, 'err');
    }
  },

  showDuration(){
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
      var r = await fetch('/api/promote', { method:'POST', headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ wallet: w, url: url, tokens: tokens }) });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
      this.status('Promoted for ' + Math.round(d.hours) + 'h ✓ — ' + d.balance + ' tokens left', 'ok');
      this.sel = null;
      this.el.querySelector('.promo-pick').textContent = 'Nothing selected yet.';
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

  showAddDur(row){
    var n = parseInt(row.querySelector('.promo-add').value, 10) || 0;
    var cost = this._cost || 5, hrs = this._hours || 24;
    var el = row.querySelector('.promo-add-dur');
    el.textContent = n > 0 ? ('+' + Math.round(hrs * (n / cost)) + 'h') : '';
  },

  /* pause / resume / top up an existing promotion */
  async action(id, act, btn, row){
    var tokens = 0;
    if (act === 'extend'){
      tokens = parseInt(row.querySelector('.promo-add').value, 10) || 0;
      if (tokens <= 0){ this.status('Enter a positive number of tokens', 'err'); return; }
    }
    btn.disabled = true;
    this.status(act === 'extend' ? 'Adding credits…' : (act === 'pause' ? 'Pausing…' : 'Resuming…'));
    try {
      var w = await riffWallet.get();
      var r = await fetch('/api/promotion/action', { method:'POST', headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ wallet: w, id: id, action: act, tokens: tokens }) });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
      this.status(
        act === 'extend' ? ('Added ' + d.added + ' tokens (+' + Math.round(d.added_hours) + 'h) — ' + d.balance + ' left')
        : act === 'pause' ? 'Paused — remaining time is banked'
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
    var list = this.el.querySelector('.promo-list');
    try {
      var w = await riffWallet.get();
      try {
        var wr = await fetch('/api/wallet?wallet=' + w);
        if (wr.ok){
          var wd = await wr.json();
          this._cost = wd.promote_cost; this._hours = wd.promote_hours || 24;
          this.el.querySelector('.promo-bal').textContent = wd.balance;
          this.el.querySelector('.promo-cost').textContent = wd.promote_cost;
          var ti = this.el.querySelector('.promo-tokens');
          ti.min = wd.promote_cost; ti.step = wd.promote_cost;
          if (!this._touched){ ti.value = wd.promote_cost; }
          this.showDuration();
        }
      } catch(e0){ /* the balance line is cosmetic */ }

      var r = await fetch('/api/promotions/mine?wallet=' + w);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var rows = await r.json();
      if (!rows.length){
        list.innerHTML = "<div class='empty promo-empty'>Nothing promoted yet.<br>Mine some tokens, then pick a track above.</div>";
        return;
      }
      var self = this;
      list.innerHTML = rows.map(function(p){
        var pid = self.idFromUrl(p.url || '') || '';
        var ended = !p.paused && new Date(p.expires_at).getTime() <= Date.now();
        var state = p.paused ? 'paused' : (ended ? 'ended' : 'live');
        var left = p.paused ? self.msLeft(p.remaining_ms) : (ended ? 'ended' : self.timeLeft(p.expires_at));
        return "<div class='promo-row " + state + "' data-yt='" + escapeHtml(pid) + "' data-id='" + p.id + "'>"
          + "<div class='promo-name'>" + escapeHtml(p.name || p.url) + "</div>"
          + "<div class='promo-stats'>"
            + "<span title='Times shown to people'>👁 " + (p.views || 0) + "</span>"
            + "<span title='Plays while promoted'>▶ " + (p.plays || 0) + "</span>"
            + "<span title='Likes while promoted'>👍 " + (p.likes || 0) + "</span>"
            + "<span title='Tokens spent'>⛏ " + (p.tokens || 0) + "</span>"
            + "<span class='promo-time' title='Promotion time remaining'>" + left + "</span>"
          + "</div>"
          + "<div class='promo-actions'>"
            + (ended ? "" :
                "<button class='promo-act' data-a='" + (p.paused ? 'resume' : 'pause') + "'>"
                + (p.paused ? '▶ Resume' : '❚❚ Pause') + "</button>")
            + "<button class='promo-act promo-topup' data-a='topup'>＋ Add credits</button>"
          + "</div>"
          + "<div class='promo-topup-row'>"
            + "<input type='number' class='promo-add' min='1' step='1' value='" + (self._cost || 5) + "'>"
            + "<span class='promo-add-dur'></span>"
            + "<button class='promo-act promo-confirm' data-a='extend'>Add</button>"
            + "<button class='promo-act promo-cancel' data-a='cancel'>✕</button>"
          + "</div></div>";
      }).join('');
    } catch(e){
      list.innerHTML = '';
      this.status('Couldn’t load your promotions: ' + e.message, 'err');
    }
  }
};
