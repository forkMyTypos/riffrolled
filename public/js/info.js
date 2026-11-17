/* riffrolled — info.js
   About / Terms / Privacy / Your data (export + restore). */

/* ABOUT_HTML, TERMS_HTML and PRIVACY_HTML live in legal-text.js (shared with /terms and /privacy). */

var DATA_HTML =
  "<h4>Your data</h4>" +
  "<p>Everything personal — playlists, track names, artists and tags, likes, play history, the links you've sent and opened, the ads you were shown, and your riff-token private key — is stored in <strong>this browser only</strong>. It is never uploaded, which also means nothing can restore it for you.</p>" +
  "<p><strong>Clearing this site's browser data deletes all of it permanently.</strong> Export a backup now and again, especially before clearing anything or switching device. riffrolled reminds you if it's been two weeks.</p>" +
  "<div class='data-guard' data-testid='data-guard'>" +
    "<div class='dg-row'><span>Last backup</span><b class='dg-last'>…</b></div>" +
    "<div class='dg-row'><span>Browser keeps it</span><b class='dg-keep'>…</b></div>" +
    "<button class='dg-ask' hidden data-testid='dg-ask'>Ask the browser to keep it</button>" +
  "</div>" +
  "<div class='data-btns'>" +
    "<button class='data-export'>⬇ Export a backup</button>" +
    "<button class='data-import'>⬆ Restore from a backup</button>" +
    "<input type='file' class='data-file' accept='application/json,.json' hidden>" +
  "</div>" +
  "<div class='status-bar data-status'></div>" +
  "<p class='info-meta'>Importing <em>merges</em> — it never deletes what's already here. The backup includes your private key, so restoring it on another device moves your token balance there too.</p>";

var infoBoss = {
  setup(){
    var main =
      "<div class='info-tabs'>" +
        "<button class='info-tab active' data-t='about'>About</button>" +
        "<button class='info-tab' data-t='terms'>Terms</button>" +
        "<button class='info-tab' data-t='privacy'>Privacy</button>" +
        "<button class='info-tab' data-t='data'>Your data</button>" +
      "</div>" +
      "<div class='info-content scrollable'>" + ABOUT_HTML + "</div>";
    this.el = menuB.createMenu('ℹ️ About &amp; Legal', main);
    menuB.place(this.el, { left:'16px', top:'16px', width:'340px', height:'430px' });
    var self = this;
    this.el.querySelectorAll('.info-tab').forEach(function(b){
      b.onclick = function(){
        self.el.querySelectorAll('.info-tab').forEach(function(x){ x.classList.remove('active'); });
        b.classList.add('active');
        self.show(b.dataset.t);
      };
    });
    this.bindTour();
  },
  /* the tour's permanent home: it auto-runs once, then lives here */
  bindTour(){
    var btn = this.el.querySelector('.tour-open');
    if (btn) btn.onclick = function(){ if (window.tourBoss) tourBoss.start(0); };
  },

  show(t){
    var c = this.el.querySelector('.info-content');
    c.innerHTML = t === 'terms' ? TERMS_HTML
      : t === 'privacy' ? PRIVACY_HTML
      : t === 'data' ? DATA_HTML
      : ABOUT_HTML;
    c.scrollTop = 0;
    if (t === 'data') this.bindData();
    else if (t === 'privacy') this.bindUsage();
    else this.bindTour();
  },

  /** open About & Legal on one tab (the usage note's "Privacy" link) */
  openTab(t){
    if (window.dock) dock.openPanel(this.el); else this.el.classList.remove('is-hidden');
    var b = this.el.querySelector(".info-tab[data-t='" + t + "']");
    if (b) b.click();
  },

  /* The usage-counting switch on the Privacy page. */
  bindUsage(){
    var cb = this.el.querySelector('.usage-cb');
    if (!cb || !window.riffUsage) return;
    cb.checked = !riffUsage.off;
    cb.onchange = async function(){
      await riffUsage.setOff(!cb.checked);
      if (window.appToast) appToast(cb.checked ? 'Thanks — anonymous counting is on' : 'Counting is off. Nothing more is counted from this browser.', 'ok');
    };
  },

  /* Export / import everything held on this device. Worth taking seriously:
     playlists, tags, reactions and the wallet key live only in this browser,
     so this file is the user's single backup. */
  bindData(){
    var c = this.el.querySelector('.info-content');
    var st = c.querySelector('.data-status');
    function say(msg, kind){
      st.textContent = msg || '';
      st.className = 'status-bar data-status' + (kind ? ' ' + kind : '');
    }

    // what protects all this: when the last backup was, and whether the browser keeps it for good
    var guard = async function(){
      var last = await dataGuard.lastBackup();
      c.querySelector('.dg-last').textContent = last ? new Date(last).toLocaleDateString() + ' (' + Math.max(0, Math.round((Date.now() - last) / 86400000)) + ' days ago)' : 'never';
      c.querySelector('.dg-last').className = 'dg-last' + (last && Date.now() - last < 14 * 86400000 ? ' good' : ' warn');
      var p = await dataGuard.persisted();
      c.querySelector('.dg-keep').textContent = p === true ? 'yes — it won’t clear it to save space' : p === false ? 'not yet — it may clear it if space runs low' : 'can’t tell in this browser';
      c.querySelector('.dg-keep').className = 'dg-keep' + (p === true ? ' good' : ' warn');
      c.querySelector('.dg-ask').hidden = p !== false;
    };
    guard();
    c.querySelector('.dg-ask').onclick = async function(){ await dbBoss.setSetting('persistAskedAt', '0'); var ok = await dataGuard.protect(); say(ok ? 'The browser will keep it ✓' : 'The browser said no for now — backups matter all the more', ok ? 'ok' : 'warn'); guard(); };
    c.querySelector('.data-export').onclick = async function(){
      try { await dataGuard.backup(); say('Backup downloaded ✓', 'ok'); guard(); }
      catch(e){ say('Export failed: ' + e.message, 'err'); }
    };

    var file = c.querySelector('.data-file');
    c.querySelector('.data-import').onclick = function(){ file.click(); };
    file.onchange = async function(){
      var f = file.files[0];
      if (!f) return;
      say('Importing…');
      try {
        var obj = JSON.parse(await f.text());
        var r = await dbBoss.importData(obj);
        if (obj.wallet && /^[0-9a-f]{64}$/.test(obj.wallet)){
          if (window.riffWallet) await riffWallet.use(obj.wallet);
          else await dbBoss.setSetting('wallet', obj.wallet);
          if (window.mineBoss) mineBoss.refresh();
          if (window.promoBoss) promoBoss.refresh();
        }
        if (window.plBoss) await plBoss.renderPlaylists();
        if (window.searchBoss) searchBoss.render();
        say('Merged +' + r.addedPlaylists + ' playlists, +' + r.addedTracks + ' tracks, +' + r.addedJoins + ' entries' +
            (r.addedReactions ? ', +' + r.addedReactions + ' likes' : '') + (r.addedPlays ? ', +' + r.addedPlays + ' plays' : ''), 'ok');
      } catch(e){ say('Import failed: ' + e.message, 'err'); }
      file.value = '';
    };
  }
};
