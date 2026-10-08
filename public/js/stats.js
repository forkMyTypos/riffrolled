/* riffrolled — stats.js
   What riffrolled tells its own server about how tracks are received.

   The rule is counters, not logs, and tallies, not histories. This collects
   what happened on this device into a few numbers, and sends them up every
   so often as one small summary:

       { plays: { ytId: 3 }, likes: { ytId: 1 }, linkFollows: [ … ] }

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
   counts. Nothing in riffrolled waits on this or breaks without it. */

var statsBoss = {
  FLUSH_MS: 4 * 60 * 1000,      // a quiet background summary
  MAX_KEYS: 60,                 // the server caps at this too

  pending: { plays: {}, likes: {}, dislikes: {}, linkFollows: [] },
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

  /** Somebody followed a link from a to b — evidence that the link is
   *  useful, which is what its maker will eventually be credited for. */
  linkFollowed(type, a, b){
    if (!type || !a || !b || a === b) return;
    if (this.pending.linkFollows.length >= 40) return;
    this.pending.linkFollows.push({ type: type, a: a, b: b });
  },

  _empty(){
    var p = this.pending;
    return !Object.keys(p.plays).length && !Object.keys(p.likes).length
        && !Object.keys(p.dislikes).length && !p.linkFollows.length;
  },

  /** @param onExit use sendBeacon — the page may be going away mid-request */
  flush(onExit){
    if (this._sending || this._empty()) return;
    var body = JSON.stringify(this.pending);
    var fresh = { plays: {}, likes: {}, dislikes: {}, linkFollows: [] };

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
    ['plays', 'likes', 'dislikes'].forEach(function(k){
      Object.keys(old[k] || {}).forEach(function(id){
        p[k][id] = (p[k][id] || 0) + old[k][id];
      });
    });
    p.linkFollows = old.linkFollows.concat(p.linkFollows).slice(0, 40);
  },
};

statsBoss.init();
