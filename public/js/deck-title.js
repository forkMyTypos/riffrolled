/* riffrolled — deck-title.js
   The title on the deck, bigger, and editable in place.

   ONE WRITE PATH. Track info already edits titles; a second editor with
   its own save would be two places to get a rename wrong — exactly the
   class of bug that once made a like button like the wrong track. So this
   writes through trackInfo.saveFor, the same function the panel uses, and
   names the track it is writing to explicitly rather than reading "the
   current one" at the moment of saving.

   LOCAL ONLY. A rename changes this device's copy and nothing else. The
   shared catalogue keeps whatever name it has, which means two people can
   call one video different things — on purpose. */

var deckTitle = {
  boot(){
    this.box = document.getElementById('npTitle');
    this.input = document.getElementById('npTitleEdit');
    this.row = this.box && this.box.closest('.np-titlerow');
    if (!this.box || !this.input || !this.row) return this;
    var self = this;

    this.box.title = 'Click to rename (only on this device)';
    this.box.addEventListener('click', function(){ self.open(); });
    this.input.addEventListener('keydown', function(e){
      if (e.key === 'Enter'){ e.preventDefault(); self.commit(); }
      else if (e.key === 'Escape'){ e.preventDefault(); self.close(); }
      e.stopPropagation();            // space and arrows belong to the field, not the player
    });
    this.input.addEventListener('blur', function(){ self.commit(); });
    return this;
  },

  async open(){
    var ytId = window.player && player.currentYtId;
    if (!ytId || this.ytId) return;          // nothing playing, or already editing
    var t = null;
    try { t = await dbBoss.getTrack(ytId); } catch(e){}
    if (!t || player.currentYtId !== ytId) return;
    this.ytId = ytId;                         // the track this edit is FOR
    this.before = t.name || '';
    this.input.value = this.before;
    this.row.classList.add('editing');
    this.input.hidden = false;
    this.input.focus();
    this.input.select();
  },

  close(){
    this.ytId = null;
    this.input.hidden = true;
    this.row.classList.remove('editing');
  },

  async commit(){
    var ytId = this.ytId;
    if (!ytId) return;
    var name = this.input.value.trim().slice(0, 300);
    var changed = name && name !== this.before;
    this.close();
    if (!changed) return;                     // a blank or unchanged title is not saved
    if (window.trackInfo) await trackInfo.saveFor(ytId, { name: name }, true);
  }
};
deckTitle.boot();
