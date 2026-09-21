/* riffrolled — info.js
   About / Terms / Privacy / Your data (export + restore). */

/* ── About & Legal panel (About / Terms / Privacy) ── */
var ABOUT_HTML =
  "<h4>riffrolled</h4>" +
  "<p>A vinyl-styled player and discovery tool for your YouTube music. Search YouTube, import whole channels, and build playlists on a spinning record deck.</p>" +
  "<p>Your playlists, tracks, reactions, and layout are saved locally on your device — there is no account to create and nothing to sign in to. A shared catalogue of tracks (name, artist, genre, link) lives on riffrolled's own server so searches and imports get faster for everyone.</p>" +
  "<p>riffrolled is an independent project and is <strong>not affiliated with, endorsed by, or sponsored by YouTube or Google LLC</strong>. Playback is provided through YouTube’s embedded player; all videos remain subject to YouTube’s Terms of Service.</p>" +
  "<p class='info-meta'>Beta · riffrolled.com</p>";

var TERMS_HTML =
  "<h4>Terms of Service</h4>" +
  "<p>By using riffrolled (“the Service”) you agree to these terms. The Service is provided <strong>“as is”</strong>, without warranties of any kind, for personal, non-commercial use during its beta period.</p>" +
  "<ul>" +
    "<li>You are responsible for how you use the Service and for any content you add, import, or play.</li>" +
    "<li>Video playback is delivered by YouTube’s embedded player and is governed by <a href='https://www.youtube.com/t/terms' target='_blank' rel='noopener'>YouTube’s Terms of Service</a>. Respect the rights of content owners.</li>" +
    "<li>Searches and channel imports are performed by riffrolled's own server using its YouTube Data API credentials; you never supply or hold a key.</li>" +
    "<li>The Service may change or be unavailable at any time, and features may break during beta.</li>" +
    "<li>To the maximum extent permitted by law, riffrolled is not liable for any damages arising from use of the Service.</li>" +
  "</ul>" +
  "<h4>Riff tokens</h4>" +"<p>Riff tokens are a play feature of the Service. They are earned by proof-of-work mining in your browser and spent on promoting tracks within the catalogue.</p>" +"<ul>" +"<li>Tokens have <strong>no monetary value</strong>, are not currency, and are not redeemable, transferable, or exchangeable for money, goods, or other assets.</li>" +"<li>Tokens are held against an anonymous wallet key stored in your browser. If you clear your browser data or lose that key, the balance is unrecoverable — there is no account recovery.</li>" +"<li>During beta, balances, prices, mining difficulty, and caps may change, and balances may be reset. Tokens obtained by automated abuse or exploitation of the Service may be voided.</li>" +"<li>Promotion statistics are approximate, are not audited, and are provided for interest only.</li>" +"</ul>" +"<p>riffrolled is not affiliated with YouTube or Google LLC.</p>" +
  "<p class='info-meta'>Last updated: 10 June 2026 (beta). Contact: via riffrolled.com. Please review with your own counsel before relying on these terms.</p>";

var PRIVACY_HTML =
  "<h4>Privacy Policy</h4>" +
  "<p><strong>What lives on our server</strong> (a shared music catalogue, and the bare minimum): track name, artist/channel, genre, and YouTube URL — added when anyone searches or imports a channel. That's the entire list. It contains nothing about <em>you</em>.</p>" +
  "<p><strong>What stays on your device</strong> (browser storage, never uploaded): your playlists and their order, play history and counts, likes/dislikes, tags and edits, track-to-track listening links, panel layout, and every setting. Clearing this site's browser data removes all of it.</p>" +
  "<p><strong>The one exception</strong>: when a <em>promoted</em> track is played or liked, a counter on that promotion is increased by one so whoever paid for it can see how it did. No wallet, device identifier, or listening history is sent with it — the server learns that a promotion got another play, never who played it. Nothing else you do is counted.</p>" +
  "<ul>" +
    "<li><strong>YouTube embeds and thumbnails:</strong> playing a video, or hovering a track to preview its thumbnail, loads content from Google's servers, which may set cookies and collect data under <a href='https://policies.google.com/privacy' target='_blank' rel='noopener'>Google's Privacy Policy</a>. That happens between you and Google.</li>" +
    "<li><strong>No accounts, no analytics, no ad tracking</strong> are built into this app.</li>" +
  "</ul>" +
  "<p class='info-meta'>Last updated: 10 June 2026 (beta). Contact: via riffrolled.com. Please review with your own counsel before publishing.</p>";

var DATA_HTML =
  "<h4>Your data</h4>" +
  "<p>Everything personal — playlists, track names and tags, play history, reactions, panel layout, and your riff-token wallet key — is stored in <strong>this browser only</strong>. It is never uploaded, which also means nothing can restore it for you.</p>" +
  "<p><strong>Clearing this site's browser data deletes all of it permanently.</strong> Export a backup now and again, especially before clearing anything or switching device.</p>" +
  "<div class='data-btns'>" +
    "<button class='data-export'>⬇ Export a backup</button>" +
    "<button class='data-import'>⬆ Restore from a backup</button>" +
    "<input type='file' class='data-file' accept='application/json,.json' hidden>" +
  "</div>" +
  "<div class='status-bar data-status'></div>" +
  "<p class='info-meta'>Importing <em>merges</em> — it never deletes what's already here. The backup includes your wallet key, so restoring it on another device moves your token balance there too.</p>";

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
  },
  show(t){
    var c = this.el.querySelector('.info-content');
    c.innerHTML = t === 'terms' ? TERMS_HTML
      : t === 'privacy' ? PRIVACY_HTML
      : t === 'data' ? DATA_HTML
      : ABOUT_HTML;
    c.scrollTop = 0;
    if (t === 'data') this.bindData();
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

    c.querySelector('.data-export').onclick = async function(){
      try {
        var data = await dbBoss.exportData();
        data.wallet = await dbBoss.getSetting('wallet');   // the tokens travel with it
        var blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var d = new Date().toISOString().slice(0, 10);
        a.href = url; a.download = 'riffrolled-backup-' + d + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
        say('Backup downloaded ✓', 'ok');
      } catch(e){ say('Export failed: ' + e.message, 'err'); }
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
          await dbBoss.setSetting('wallet', obj.wallet);
          if (window.riffWallet) riffWallet._w = obj.wallet;
          if (window.mineBoss) mineBoss.refresh();
          if (window.promoBoss) promoBoss.refresh();
        }
        if (window.plBoss) await plBoss.renderPlaylists();
        if (window.searchBoss) searchBoss.render();
        say('Merged +' + r.addedPlaylists + ' playlists, +' + r.addedTracks + ' tracks, +' + r.addedJoins + ' entries', 'ok');
      } catch(e){ say('Import failed: ' + e.message, 'err'); }
      file.value = '';
    };
  }
};
