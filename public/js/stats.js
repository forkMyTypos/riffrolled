/* riffrolled — stats.js
   What riffrolled tells its own server about how tracks are received.

   The rule is counters, not logs, and tallies, not histories. This collects
   what happened on this device into a few numbers, and sends them up every
   so often as one small summary:

       { plays: { ytId: 3 }, likes: { ytId: 1 }, dislikes: { ytId: 1 } }

   No wallet, no device id, no session id, no per-event timestamps, no
   order. The server adds them to counters and cannot reconstruct who did
   what — the same promise info.js already makes about promotion events,
   extended to the rest of the site instead of quietly abandoned the moment
   the reward engine wanted data.

   Batching matters for cost as much as for privacy: D1's free plan allows
   100,000 row writes a day, and a request per play would spend them on
   round trips. One summary every few minutes spends the same writes and a
   fraction of the requests.

   Everything here is best-effort. A failed flush keeps its tally and tries
   again; a browser that closes mid-session loses at most a few minutes of
   counts. Nothing in riffrolled waits on this or breaks without it.

   Links between tracks are never sent: they stay in Dexie. */

var statsBoss = {
  FLUSH_MS: 4 * 60 * 1000,      // a quiet background summary
  MAX_KEYS: 60,                 // the server caps at this too

  pending: { plays: {}, likes: {}, dislikes: {}, events: {} },
  _timer: null,
  _sending: false,

  init(){
    var self = this;
    this._timer = setInterval(function(){ self.flush(); }, this.FLUSH_MS);

    /* pagehide is the one that actually fires on mobile — a phone browser
       may never deliver beforeunload or a visibilitychange on the way out,
       so a session's last few minutes would simply vanish. */
    window.addEventListener('pagehide', function(){ self.flush(true); });
    document.addEventListener('visibilitychange', function(){
      if (document.hidden) self.flush(true);
    });
  },

  _bump(bucket, ytId){
    if (!ytId) return;
    var b = this.pending[bucket];
    if (!b[ytId] && Object.keys(b).length >= this.MAX_KEYS) return;   // sane ceiling
    b[ytId] = (b[ytId] || 0) + 1;
  },

  play(ytId)    { this._bump('plays', ytId); },
  like(ytId)    { this._bump('likes', ytId); },
  dislike(ytId) { this._bump('dislikes', ytId); },

  _empty(){
    var p = this.pending;
    return !Object.keys(p.plays).length && !Object.keys(p.likes).length
        && !Object.keys(p.dislikes).length && !Object.keys(p.events || {}).length;
  },

  /** @param onExit use sendBeacon — the page may be going away mid-request */
  flush(onExit){
    if (this._sending || this._empty()) return;
    // counting switched off since these were noted: they never leave
    if (window.riffUsage && riffUsage.off) this.pending.events = {};
    if (this._empty()) return;
    var body = JSON.stringify(this.pending);
    var fresh = { plays: {}, likes: {}, dislikes: {}, events: {} };

    if (onExit && navigator.sendBeacon){
      try {
        // a Blob with a JSON type, or some browsers send it as text/plain
        navigator.sendBeacon('/api/stats', new Blob([body], { type: 'application/json' }));
        this.pending = fresh;
      } catch (e) { /* keep the tally and try again next time */ }
      return;
    }

    var self = this;
    var sent = this.pending;
    this.pending = fresh;          // swap first, so counts during the request aren't lost
    this._sending = true;
    fetch('/api/stats', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body,
      keepalive: true,
    }).catch(function(){
      // put it back: a dropped connection shouldn't silently eat the counts
      self._merge(sent);
    }).finally(function(){ self._sending = false; });
  },

  _merge(old){
    var p = this.pending;
    ['plays', 'likes', 'dislikes', 'events'].forEach(function(k){
      p[k] = p[k] || {};
      Object.keys(old[k] || {}).forEach(function(id){
        p[k][id] = (p[k][id] || 0) + old[k][id];
      });
    });
  },
};

statsBoss.init();

/* ── how riffrolled is used ──────────────────────────────────────────
   riffUsage.count('panel:mixes') adds one to a tally that goes up with the
   summary above, where the server adds it to that day's total for that
   event (src/usage.js has the closed list; anything else is dropped).
   Nothing identifies the browser: no id, no order, no time of day.

   Off when the listener says so (Privacy → "Count how I use riffrolled"),
   and off from the start in a browser that sends Global Privacy Control. */
var riffUsage = {
  KEY: 'usageOff',
  off: false,

  async init(){
    try {
      var v = await dbBoss.getSetting(this.KEY);
      this.off = v === '1' || (v == null && navigator.globalPrivacyControl === true);
    } catch(e){}
    if (this.off) statsBoss.pending.events = {};
    var self = this;
    // say so on the page, once per browser
    try { if (!this.off && await dbBoss.getSetting('usageNoticeSeen') !== '1') setTimeout(function(){ self.notice(); }, 4000); } catch(e){}
    // a visit: once per tab, after the page has settled (phone or computer, first time or not)
    setTimeout(function(){
      var seen = false;
      try { seen = sessionStorage.getItem('rrVisit') === '1'; sessionStorage.setItem('rrVisit', '1'); } catch(e){}
      if (seen) return;
      self.count('visit');
      self.count(document.body.classList.contains('mobile') ? 'visit_phone' : 'visit_computer');
      if (window.newHere && newHere.on) self.count('visit_new');
    }, 2500);
  },

  /* A small note, once: what is counted, a link to Privacy, and OK. Never
     over the YouTube player (it moves to the top if it would be). */
  notice(){
    if (document.getElementById('usageNote')) return;
    var n = document.createElement('div');
    n.id = 'usageNote'; n.className = 'usage-note'; n.setAttribute('role', 'status');
    n.setAttribute('data-testid', 'usage-note');
    n.innerHTML = "<span>riffrolled counts how its features are used — anonymous daily totals, nothing about you.</span>" +
      "<button class='un-priv' data-testid='usage-note-privacy'>Privacy &amp; switch off</button>" +
      "<button class='un-ok' data-testid='usage-note-ok'>OK</button>";
    document.body.appendChild(n);
    // off the YouTube player and the record player's controls
    var pl = document.querySelector('#deck .plinth');
    var over = function(el){ if (!el || !el.offsetParent) return false; var a = n.getBoundingClientRect(), b = el.getBoundingClientRect();
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; };
    if ((window.ytGuard && ytGuard.overlaps(n)) || over(pl)) n.classList.add('top');
    var done = function(){ n.remove(); try { dbBoss.setSetting('usageNoticeSeen', '1'); } catch(e){} };
    n.querySelector('.un-ok').onclick = done;
    n.querySelector('.un-priv').onclick = function(){ done(); if (window.infoBoss) infoBoss.openTab('privacy'); };
  },

  count(name){
    if (this.off || !name) return;
    var e = statsBoss.pending.events = statsBoss.pending.events || {};
    e[name] = (e[name] || 0) + 1;
  },

  async setOff(off){
    this.off = !!off;
    if (this.off) statsBoss.pending.events = {};
    try { await dbBoss.setSetting(this.KEY, this.off ? '1' : '0'); } catch(e){}
  }
};
window.addEventListener('load', function(){ riffUsage.init(); });
