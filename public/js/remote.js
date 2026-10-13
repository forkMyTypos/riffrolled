/* riffrolled — remote.js
   The remote controls: prev, play, next, the repeat menu and Track info.

   THEY ARE PART OF THE RECORD PLAYER

   On a desktop the controls are a strip of round chrome knobs set into the
   bottom edge of the plinth — the strip of bare plinth that runs under the
   record — like the buttons on a real turntable. They used to be a separate
   puck you could drag around; it never looked like it belonged. Nothing
   floats now, nothing is dragged, nothing is remembered, and so there is no
   position to lose and no way to leave the controls somewhere odd.

   IT REPLACES THE DECK'S ROW OF BUTTONS, IT DOES NOT ADD TO IT

   Two sets of play buttons that can disagree is a bug factory, so there is
   one set. It is the same DOM as before — same ids (#btnPlay, #btnPrev,
   #btnNext, #btnCtl, #ctlMenu, #btnInfo), same handlers bound by
   playlist.js — only moved and restyled.

   DESKTOP: the node is moved into the plinth (.docked). The plinth's bottom
   gap is a constant 48px whatever size the record is (deck.css sizes the
   plinth 376px bigger than the video and the turntable 280px bigger), so
   the strip fits at every size and never goes near the video.

   PHONE: it stays in the deck, in the flow, below the record, as the row it
   was — same chrome knobs, same ids.

   THE YOUTUBE PLAYER: nothing may cover it. The strip lives outside the
   turntable, so it cannot; avoidPlayer() stays only so that ytGuard's
   "step aside" call has something to call. */

var remote = {
  el: null,
  docked: false,

  boot(){
    this.el = document.getElementById('remote');
    if (!this.el) return this;
    var self = this;

    // The repeat menu opens beside the strip, never over the video (nothing
    // may cover the player): to the right of whichever is further right, the
    // strip or the video; to the left instead when there is no room.
    var btn = document.getElementById('btnCtl');
    if (btn) btn.addEventListener('click', function(){ setTimeout(function(){ self.placeMenu(); }, 0); });
    window.addEventListener('resize', function(){ self.placeMenu(); });
    window.addEventListener('rr:videosize', function(){ self.placeMenu(); });

    // the info button: Track info for whatever is playing
    var info = document.getElementById('btnInfo');
    if (info) info.addEventListener('click', function(){
      if (window.trackInfo){
        if (window.player && player.currentYtId) trackInfo.show(player.currentYtId);
        else if (window.dock) dock.openPanel(trackInfo.el);
      }
    });
    return this;
  },

  /** Desktop docks into the plinth; a phone keeps the row in the deck. Called by dock.setMode. */
  mount(isMobile){
    if (!this.el) return;
    if (isMobile){
      this.docked = false;
      this.el.classList.remove('docked');
      var row = document.querySelector('.np-area .np-titlerow');
      if (row && this.el.parentNode !== row.parentNode) row.parentNode.insertBefore(this.el, row.nextSibling);
      return;
    }
    var plinth = document.querySelector('#deck .plinth');
    if (!plinth) return;
    this.docked = true;
    if (this.el.parentNode !== plinth) plinth.appendChild(this.el);
    this.el.classList.add('docked');
  },

  placeMenu(){
    var menu = document.getElementById('ctlMenu');
    if (!menu || menu.hidden || !this.docked) return;
    var r = this.el.getBoundingClientRect();
    var v = window.ytGuard && ytGuard.rect();
    var G = 12, w = menu.offsetWidth || 250;
    menu.style.transform = 'none'; menu.style.right = 'auto'; menu.style.bottom = '0';
    var right = Math.max(r.right, v ? v.right : 0) + G;
    if (right + w <= window.innerWidth - 8){ menu.style.left = (right - r.left) + 'px'; return; }
    var left = Math.min(r.left, v ? v.left : r.left) - G - w;
    menu.style.left = (Math.max(8, left) - r.left) + 'px';
  },

  /** Kept for ytGuard: the strip is outside the video by construction, so there is nothing to move. */
  avoidPlayer(){ return false; }
};
remote.boot();
