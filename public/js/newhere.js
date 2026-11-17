/* riffrolled — newhere.js
   Whether this is someone's first few minutes.

   riffrolled has eleven panels, an economy, a DJ and a catalogue. Every
   one of them is worth having and none of them is something a person
   needs before they have heard a single track. So there is one question,
   asked once, and the rest of the app can answer it however suits it:

     is this person still new here?

   They are, until the first track plays. Then they are not, for good —
   the flag is stored, so a reload does not make a regular a newcomer
   again, and nothing is hidden from anyone who has already listened.

   What "new" changes today, and nothing else:
     · on a phone the dock is Player, Playlist, Search, DJ AI and a ⋯
       that reveals the rest (dock.js)
     · no promoted card is shown (promo-popup.js) — an advert before the
       first note is bad manners, and the promoter's credit is spent on
       attention that was never going to convert
     · on a phone the multi-step tour is not forced on them; the empty
       deck offers one thing to do instead (player.js deckHint)

   It reads, it never writes anywhere but its own setting. Someone who
   already has listening history is never "new", whatever else is true. */

var newHere = {
  SETTING: 'firstPlayDone',
  MIX_SETTING: 'firstMixDone',
  on: false,        // true while the person is still new
  mixed: true,      // false until they have made (or played) their first mix
  known: false,     // false until the stored answer has been read

  /* A second question, asked the same way: have they made their first
     mix? Until then Mine and Promote stay out of the dock (dock.js
     notYet). Someone who was listening before this question existed has
     no answer stored but has history: they keep everything. A brand-new
     browser stores '0', and the first mix turns it to '1' for good. */
  async init(){
    var history = 0;
    try { history = await db.playHistory.count(); } catch(e){}
    try {
      if (await dbBoss.getSetting(this.SETTING)) this.on = false;
      else this.on = history === 0;
    } catch(e){ this.on = false; }     // when in doubt, show everything
    try {
      var m = await dbBoss.getSetting(this.MIX_SETTING);
      if (m === '1') this.mixed = true;
      else if (m === '0') this.mixed = false;
      else if (history > 0) this.mixed = true;
      else { this.mixed = false; await dbBoss.setSetting(this.MIX_SETTING, '0'); }
    } catch(e){ this.mixed = true; }
    this._publish();
    this.known = true;
    document.body.classList.add('nh-known');
    if (window.dock && dock.refreshForNewHere) dock.refreshForNewHere();
  },

  /** A track has started playing: nobody is new after this. */
  clear(){
    if (!this.on) return;
    this.on = false;
    try { dbBoss.setSetting(this.SETTING, '1'); } catch(e){}
    this._publish();
    // a card is never shown within its quiet period of someone arriving
    if (window.promoPopup) promoPopup._next = Math.max(promoPopup._next || 0, Date.now() + promoPopup.FIRST_DELAY);
    if (window.dock && dock.refreshForNewHere) dock.refreshForNewHere();
  },

  /** A mix was made (DJ AI, an auto mix) or a ready-made one played.
      Mine and Promote come into the dock, with one line saying why. */
  markMixed(){
    if (this.mixed) return;
    this.mixed = true;
    try { dbBoss.setSetting(this.MIX_SETTING, '1'); } catch(e){}
    this._publish();
    if (window.dock && dock.refreshForNewHere) dock.refreshForNewHere();
  },

  _publish(){
    document.documentElement.setAttribute('data-rr-new-here', this.on ? '1' : '0');
    document.documentElement.setAttribute('data-rr-mixed', this.mixed ? '1' : '0');
  }
};
