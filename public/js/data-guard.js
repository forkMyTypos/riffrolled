/* riffrolled — data-guard.js
   Two things that live in this browser and nowhere else:

   linksLog   the links you sent (a playlist, a track, a mix) and the ones
              you opened from other people. History → Links shows them,
              newest first; the same link sent twice is one row, moved to
              the top. Dexie table sharedLinks (db.js v14).

   dataGuard  keeping everything here from being lost:
              · asks the browser for persistent storage once there is
                something worth keeping, so it won't be cleared when the
                disk runs low (most browsers decide silently; Firefox asks)
              · remembers when the last backup was made, and — once there
                is real data and no backup for 14 days — shows one gentle
                note with an Export button. "Later" waits a week.
              · backup(): the download itself, used by About → Your data
                and by the note. */
var linksLog = {
  MAX: 200,

  /** { kind:'sent'|'opened', type:'playlist'|'track'|'mix', url, title, slug?, ytId? } */
  async add(l){
    try {
      if (!l || !l.url || (l.kind !== 'sent' && l.kind !== 'opened')) return;
      var row = await db.sharedLinks.where('url').equals(l.url).filter(function(x){ return x.kind === l.kind; }).first();
      var rec = { ts: Date.now(), kind: l.kind, type: l.type || 'mix', url: String(l.url).slice(0, 300),
                  title: String(l.title || '').slice(0, 200), slug: String(l.slug || '').slice(0, 20), ytId: String(l.ytId || '').slice(0, 20) };
      if (row) await db.sharedLinks.update(row.id, rec); else await db.sharedLinks.add(rec);
      var n = await db.sharedLinks.count();
      if (n > this.MAX){
        var old = await db.sharedLinks.orderBy('ts').limit(n - this.MAX).primaryKeys();
        await db.sharedLinks.bulkDelete(old);
      }
      document.dispatchEvent(new CustomEvent('riffrolled:links'));
    } catch(e){ /* a log is never worth an error */ }
  },

  async list(){ try { return await db.sharedLinks.orderBy('ts').reverse().toArray(); } catch(e){ return []; } },

  async remove(id){ await db.sharedLinks.delete(id); document.dispatchEvent(new CustomEvent('riffrolled:links')); }
};

var dataGuard = {
  REMIND_DAYS: 14,
  SNOOZE_DAYS: 7,

  async init(){
    try { if (!(await dbBoss.getSetting('firstUseAt'))) await dbBoss.setSetting('firstUseAt', String(Date.now())); } catch(e){}
    var self = this;
    // after the page has settled, and again now and then for people who leave it open
    setTimeout(function(){ self.check(); }, 8000);
    setInterval(function(){ self.check(); }, 6 * 3600 * 1000);
  },

  /** how much is here that would hurt to lose */
  async size(){
    var out = { playlists: 0, tracks: 0, likes: 0 };
    try {
      out.playlists = await db.playlists.count();
      out.tracks = await db.tracks.count();
      out.likes = await db.reactions.where('kind').equals('like').count();
    } catch(e){}
    out.worth = out.playlists >= 2 || out.tracks >= 10 || out.likes >= 5;
    return out;
  },

  /** is the browser keeping this site's storage for good? (true / false / null if it can't say) */
  async persisted(){
    try { return navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; }
    catch(e){ return null; }
  },

  /** ask once there is something worth keeping; never more than once a week */
  async protect(){
    try {
      if (!navigator.storage || !navigator.storage.persist) return null;
      if (await navigator.storage.persisted()) return true;
      var last = Number(await dbBoss.getSetting('persistAskedAt')) || 0;
      if (Date.now() - last < 7 * 86400000) return false;
      await dbBoss.setSetting('persistAskedAt', String(Date.now()));
      var ok = await navigator.storage.persist();
      return !!ok;
    } catch(e){ return null; }
  },

  async lastBackup(){ return Number(await dbBoss.getSetting('lastBackupAt')) || 0; },

  async check(){
    var s = await this.size();
    if (!s.worth) return;
    await this.protect();
    var now = Date.now(), DAY = 86400000;
    var last = await this.lastBackup();
    var since = last || Number(await dbBoss.getSetting('firstUseAt')) || now;
    var snooze = Number(await dbBoss.getSetting('backupSnoozeUntil')) || 0;
    if (now < snooze) return;
    if (now - since < this.REMIND_DAYS * DAY) return;
    this.remind(s, last);
  },

  /* The note: what is at stake, when the last backup was, Export / Later.
     A neutral banner (it stays until answered), never a dialog. */
  remind(s, last){
    var self = this;
    var what = [s.playlists + (s.playlists === 1 ? ' playlist' : ' playlists'), s.tracks + ' tracks'];
    if (s.likes) what.push(s.likes + ' likes');
    var when = last ? 'Your last backup was ' + Math.round((Date.now() - last) / 86400000) + ' days ago.' : 'You haven’t made a backup yet.';
    appNotify(what.join(', ') + ' are saved only in this browser. ' + when, '', {
      label: 'Export a backup',
      run: function(){ return self.backup(); }
    });
    var b = document.getElementById('appBanner');
    if (b && !b.querySelector('.banner-later')){
      var later = document.createElement('button');
      later.className = 'banner-act banner-later'; later.textContent = 'Later';
      later.setAttribute('data-testid', 'backup-later');
      later.onclick = function(){ b.hidden = true; dbBoss.setSetting('backupSnoozeUntil', String(Date.now() + self.SNOOZE_DAYS * 86400000)); };
      var x = b.querySelector('.x'); b.insertBefore(later, x);
    }
    if (b) b.setAttribute('data-testid-kind', 'backup-reminder');
  },

  /** download everything here as one file, and remember when */
  async backup(){
    var data = await dbBoss.exportData();
    data.wallet = await dbBoss.getSetting('wallet');   // the tokens travel with it
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'riffrolled-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    await dbBoss.setSetting('lastBackupAt', String(Date.now()));
    await dbBoss.setSetting('backupSnoozeUntil', '0');
    if (window.appToast) appToast('Backup downloaded — keep it somewhere safe', 'ok');
    return true;
  }
};
window.addEventListener('load', function(){ dataGuard.init(); });
