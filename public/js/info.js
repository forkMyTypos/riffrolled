/* riffrolled — info.js
   About / Terms / Privacy / Your data (export + restore). */

/* ── About & Legal panel (About / Terms / Privacy) ── */
var ABOUT_HTML =
  "<h4>riffrolled</h4>" +
  "<p>A vinyl-styled player and discovery tool for your YouTube music. Search YouTube, import whole channels, and build playlists on a spinning record deck.</p>" +
  "<p><button class='tour-open'>🎓 How riffrolled works</button> <span class='info-meta'>— the seven-step tour, any time you want it.</span></p>" +
  "<p>Your playlists, tracks, reactions, and layout are saved locally on your device — there is no account to create and nothing to sign in to. A shared catalogue of tracks (name, artist, genre, link) lives on riffrolled's own server so searches and imports get faster for everyone.</p>" +
  "<p>riffrolled is an independent project and is <strong>not affiliated with, endorsed by, or sponsored by YouTube or Google LLC</strong>. Playback is provided through YouTube’s embedded player; all videos remain subject to YouTube’s Terms of Service.</p>" +
  "<p>Questions, feedback, or something not working? Write to <a href='mailto:hello@riffrolled.com'>hello@riffrolled.com</a>.</p>" +
  "<p class='info-meta'>Beta · riffrolled.com</p>";

var TERMS_HTML =
  "<h4>Terms of Service</h4>" +
  "<p>By using riffrolled (“the Service”) you agree to these terms. The Service is provided <strong>“as is”</strong>, without warranties of any kind, for personal, non-commercial use during its beta period.</p>" +
  "<ul>" +
    "<li>You are responsible for how you use the Service and for any content you add, import, or play.</li>" +
    "<li>Video playback is delivered by YouTube’s embedded player and is governed by <a href='https://www.youtube.com/t/terms' target='_blank' rel='noopener'>YouTube’s Terms of Service</a>. Respect the rights of content owners.</li>" +
    "<li>Searches and channel imports are performed by riffrolled's own server using its YouTube Data API credentials; you never supply or hold a key. YouTube searching has a daily site-wide allowance and may pause until the next day.</li>" +
    "<li><strong>Promotions and shared mixes</strong> must point to lawful content you would be comfortable showing to strangers. A key's first promotion and first mix shared to Community wait for a quick check by the operator; a mix sent by link works straight away. Listeners can report a promoted card or a mix; enough reports take it down until the operator has looked at it. The operator may end any promotion, with or without refunding its unspent tokens (without, for spam or abuse), and may hide any mix or block any key.</li>" +
    "<li><strong>Usage counts.</strong> riffrolled counts how its features are used, as anonymous daily totals (for example: visits, panels opened, DJ briefs copied, playlists shared, promoted cards shown). The Privacy policy says exactly what is counted and what is not, and how to switch it off.</li>" +
    "<li>The Service may change or be unavailable at any time, and features may break during beta.</li>" +
    "<li>To the maximum extent permitted by law, riffrolled is not liable for any damages arising from use of the Service.</li>" +
  "</ul>" +
  "<h4>Riff tokens</h4>" +"<p>Riff tokens are a play feature of the Service. They are earned by proof-of-work mining in your browser and spent on promoting tracks within the catalogue.</p>" +"<ul>" +"<li>Tokens have <strong>no monetary value</strong>, are not currency, and are not redeemable, transferable, or exchangeable for money, goods, or other assets.</li>" +"<li>Tokens are held against an anonymous wallet: a private key stored in your browser, and a public key derived from it. If you clear your browser data without a copy of the private key, the balance is unrecoverable — there is no account recovery.</li>" +"<li>Mining difficulty is not fixed. It adjusts automatically with how fast the whole site is minting, so the work one token costs can rise or fall at any time without notice. Accounts that joined early mine at a permanently lower difficulty.</li>" +"<li>During beta, balances, prices, mining difficulty, and limits may change, and balances may be reset. Tokens obtained by automated abuse or exploitation of the Service may be voided.</li>" +"<li>Promotion statistics are approximate, are not audited, and are provided for interest only.</li>" +"</ul>" +"<p>riffrolled is not affiliated with YouTube or Google LLC.</p>" +
  "<p class='info-meta'>Last updated: 26 October 2026 (beta). Contact: <a href='mailto:hello@riffrolled.com'>hello@riffrolled.com</a>. Please review with your own counsel before relying on these terms.</p>";

var PRIVACY_HTML =
  "<h4>Privacy Policy</h4>" +
  "<p><strong>What lives on our server</strong> (a shared music catalogue, and the bare minimum): track name, artist/channel, genre, and YouTube URL, plus <em>when</em> each track was added and <em>how</em> (search, channel or playlist import, or a pasted link) — never <em>who</em> added it. It contains nothing about <em>you</em>.</p>" +
  "<p><strong>Riff tokens</strong> are recorded against your wallet's <em>public key</em>: each token mined, each promotion and what it cost. That's what makes a balance work. Your <em>private key</em> stays in your browser — it is sent to riffrolled only to prove the wallet is yours, and is never stored. The site's operator can see activity per public key to stop abuse, but a key isn't linked to your name, email, IP address or anything else about you.</p>" +
  "<p><strong>Sharing a mix</strong> (the Share button, or “Share with community” in DJ AI — both off until you choose them) publishes its name, tracks and DJ choices for anyone to play. Your wallet's <em>public key</em> is recorded with it so the operator can trace and remove abuse. Other listeners see it only if you tick “Show shared by”, and then only its first six characters (rr·abc123). A mix sent by link is in no list, but anyone who has the link can open it, and it works straight away. The first time a key shares to Community or promotes, it waits until the operator has looked at it; once that key is approved, what it shares or promotes goes up straight away.</p>" +
  "<p><strong>Counting without knowing who</strong>: to enforce a few limits, the server keeps a one-way hash of your network (IP) address — never the address itself, and a different hash for each purpose, so they cannot be joined: how many mixes a person shared today (kept two days), which promoted cards a person has been shown in the last few hours so nobody is charged twice for the same person (kept up to a week), and one report per person per promoted card or mix (kept with that card or mix). When a promoted card is requested, the page sends the genre name of the track on your deck, so campaigns aimed at other genres are left out; nothing else about what you play goes with it.</p>" +
  "<p><strong>Promoted cards you were shown</strong>: the last 20 are listed in History → Ads, and where you moved the cards and how big you made them is remembered for your next visit. Both are kept in this browser only and never sent anywhere.</p>" +
  "<p><strong>What stays on your device</strong> (browser storage, never uploaded): your playlists and their order, play history and counts, likes/dislikes, tags and edits, track-to-track listening links, panel layout, and every setting. Clearing this site's browser data removes all of it.</p>" +
  "<p><strong>Counters, not history</strong>: every few minutes the page sends a small tally of how many times tracks were played, liked or disliked, and the server adds those numbers to the catalogue's counters. When a <em>promoted</em> track is played or liked, a counter on that promotion goes up too, so whoever paid for it can see how it did. No wallet, device identifier, timestamps or order are sent with any of it — the server learns that a track got another play, never who played it or what else they played.</p>" +
  "<p><strong>How riffrolled is used</strong>: to see which features people use, the page counts a fixed list of things — a visit (once per tab, and whether it is a phone or a computer and a first visit), each panel opened, plays, likes, DJ briefs copied and sets imported, playlists made, links and mixes shared, searches, tokens mined, and promoted cards shown, played, added, closed or reported. These go up with the tally above and the server adds them to <em>that day's total for each</em>. Nothing else goes with them: no identifier, no device details, no time of day, no order, nothing about which track or playlist. Totals are kept up to 400 days. " +
    "If your browser sends Global Privacy Control, counting starts switched off.</p>" +
  "<label class='usage-opt' data-testid='usage-opt'><input type='checkbox' class='usage-cb'> Count how I use riffrolled (anonymous daily totals)</label>" +
  "<p><strong>DJ AI sets</strong>: the tracks of a set you build are added to the shared catalogue (name, artist, genre, YouTube link), like any other track. The set itself — its name and order — stays in your browser.</p>" +
  "<ul>" +
    "<li><strong>YouTube embeds and thumbnails:</strong> playing a video, or hovering a track to preview its thumbnail, loads content from Google's servers, which may set cookies and collect data under <a href='https://policies.google.com/privacy' target='_blank' rel='noopener'>Google's Privacy Policy</a>. That happens between you and Google.</li>" +
    "<li><strong>No accounts, no cookies, no third-party analytics and no ad tracking</strong> are built into this app. The usage totals above are riffrolled's own and stay with riffrolled.</li>" +
  "</ul>" +
  "<p class='info-meta'>Last updated: 26 October 2026 (beta). Contact: <a href='mailto:hello@riffrolled.com'>hello@riffrolled.com</a>. Please review with your own counsel before publishing.</p>";

var DATA_HTML =
  "<h4>Your data</h4>" +
  "<p>Everything personal — playlists, track names and tags, play history, reactions, panel layout, and your riff-token private key — is stored in <strong>this browser only</strong>. It is never uploaded, which also means nothing can restore it for you.</p>" +
  "<p><strong>Clearing this site's browser data deletes all of it permanently.</strong> Export a backup now and again, especially before clearing anything or switching device.</p>" +
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
          if (window.riffWallet) await riffWallet.use(obj.wallet);
          else await dbBoss.setSetting('wallet', obj.wallet);
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
