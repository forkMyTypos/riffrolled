/* riffrolled — track-info.js
   The Track info panel: title, artist, tags, reactions and play count for
   one track.

   WHY THIS IS ITS OWN FILE

   The panel used to be three handlers scattered through player.js, each
   reading `player.currentYtId` at the moment it fired. That made it
   structurally incapable of showing anything but the track playing right
   now — so an info button on a playlist row had nowhere to go. Nothing
   owned the panel, so nothing could point it somewhere else.

   Now one object owns it and holds a `target`. The target follows the
   player by default, which is the behaviour that was there before, and
   can be pinned to any track. Pinning is visible: the sleeve stops
   spinning and the panel says it is not showing what is playing, because
   a panel that silently describes a different track than the one you can
   hear is worse than no panel.

   TAGS

   Tags are stored as they always were — one comma-separated string on the
   track row — because everything that reads them (search, the DJ's
   context, export) already expects that. What changed is the input: a
   comma-separated text field asks you to get punctuation right and gives
   no feedback until you reload, while chips show you what you have and
   remove one at a time. The `#` is a sigil, not stored: tags go in
   lower-case without it, so `#Night`, `night` and ` NIGHT ` are one tag
   rather than three. */

var trackInfo = {
  el: null,
  target: '',          // the ytId on screen
  pinned: false,       // true once the user chose a track other than the playing one
  _track: null,

  boot(){
    this.el = document.getElementById('ctPanel');
    if (!this.el) return;

    var self = this;
    var q = function(s){ return self.el.querySelector(s); };

    this.ui = {
      thumb: q('.ti-thumb'), art: q('.ti-art'),
      title: q('.ct-title'), artist: q('.np-artist'),
      plays: q('.ti-plays'), added: q('.ti-added'), yt: q('.ti-yt'),
      elsewhere: q('.ti-elsewhere'), back: q('.ti-back'),
      tags: q('.ti-tags'), tagNew: q('.ti-tagnew'),
      likeCount: q('.like-count'), dislikeCount: q('.dislike-count')
    };

    /* Saved on change, not on every keystroke: a title is edited in the
       middle as often as at the end, and writing on input would save a
       dozen half-renamed versions and re-render the playlist under the
       cursor each time. */
    this.ui.title.addEventListener('change', function(){
      self.save({ name: this.value.trim() }, true);
    });
    this.ui.artist.addEventListener('change', function(){
      self.save({ artist: this.value.trim() });
    });

    this.ui.tagNew.addEventListener('keydown', function(e){
      if (e.key === 'Enter'){ e.preventDefault(); self.addTag(this.value); this.value = ''; return; }
      // comma works too, because people type tags with commas out of habit
      if (e.key === ','){ e.preventDefault(); self.addTag(this.value); this.value = ''; return; }
      // backspace on an empty box removes the last chip, as in every
      // other tag field anybody has used
      if (e.key === 'Backspace' && !this.value) self.removeLastTag();
    });
    this.ui.tagNew.addEventListener('blur', function(){
      if (this.value.trim()){ self.addTag(this.value); this.value = ''; }
    });

    this.ui.tags.addEventListener('click', function(e){
      var x = e.target.closest('.ti-tag-x');
      if (x) self.removeTag(x.parentElement.dataset.t);
    });

    this.ui.back.onclick = function(){ self.unpin(); };

    return this;
  },

  /** The player moved on. Follow it unless the user pinned another track. */
  async follow(ytId){
    if (this.pinned && this.target && this.target !== ytId){
      this.renderPinnedState();      // the sleeve has to stop spinning
      return;
    }
    this.pinned = false;
    this.target = ytId;
    await this.render();
  },

  /** Show a specific track, and stay on it. */
  async show(ytId){
    if (!ytId) return;
    this.target = ytId;
    this.pinned = (window.player && player.currentYtId) ? ytId !== player.currentYtId : true;
    await this.render();
    if (window.dock && this.el) dock.openPanel(this.el);
  },

  async unpin(){
    this.pinned = false;
    if (window.player && player.currentYtId) this.target = player.currentYtId;
    await this.render();
  },

  async save(patch, alsoTitle){
    if (!this.target || !window.dbBoss) return;
    var name = patch.name;
    if (alsoTitle && !name) return;          // refuse to blank a title
    await dbBoss.updateTrackMeta(this.target, patch);
    if (this._track) Object.assign(this._track, patch);

    // the deck caption is the same fact in another place
    if (alsoTitle && window.player && player.currentYtId === this.target && player.el.title){
      player.el.title.textContent = name;
    }
    if (window.plBoss){ await plBoss.renderTracks(); plBoss.renderPlaylists(); }
    if (window.searchBoss) searchBoss.render();
  },

  /* ── tags ───────────────────────────────────────────────────────────
     Stored as one comma-separated string, so these three helpers are the
     only place that format is parsed or written. */

  tagList(){
    return String((this._track && this._track.tags) || '')
      .split(',').map(function(s){ return s.trim().toLowerCase(); })
      .filter(Boolean);
  },

  async writeTags(list){
    // deduped and capped: a track with forty tags is a track with none
    var seen = {}, out = [];
    list.forEach(function(t){ if (t && !seen[t]){ seen[t] = 1; out.push(t); } });
    await this.save({ tags: out.slice(0, 20).join(', ') });
    this.renderTags();
  },

  async addTag(raw){
    // strip a leading # so pasting "#night" does not store "#night"
    var t = String(raw || '').trim().toLowerCase().replace(/^#+/, '')
      .replace(/[,\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || !this.target) return;
    var list = this.tagList();
    if (list.indexOf(t) >= 0) return;
    list.push(t);
    await this.writeTags(list);
  },

  async removeTag(t){
    if (!t) return;
    await this.writeTags(this.tagList().filter(function(x){ return x !== t; }));
  },

  async removeLastTag(){
    var list = this.tagList();
    if (!list.length) return;
    list.pop();
    await this.writeTags(list);
  },

  /* ── drawing ────────────────────────────────────────────────────── */

  renderTags(){
    var list = this.tagList();
    this.ui.tags.innerHTML = list.length
      ? list.map(function(t){
          return "<span class='ti-tag' data-t='" + escapeHtml(t) + "'>#" + escapeHtml(t)
            + "<button class='ti-tag-x' type='button' title='Remove'>✕</button></span>";
        }).join('')
      : "<span class='ti-notags'>No tags yet. They help the DJ and the Random Mix.</span>";
  },

  /** Spin and the "not playing" notice both answer one question. */
  renderPinnedState(){
    var playing = !!(window.player && player.currentYtId === this.target && player.isPlaying);
    var isCurrent = !!(window.player && player.currentYtId === this.target);
    this.ui.art.classList.toggle('spinning', playing && (!window.player || player.spinEnabled !== false));
    this.ui.elsewhere.hidden = isCurrent || !this.target;
  },

  async render(){
    if (!this.el || !this.ui) return;
    var ytId = this.target;
    if (!ytId){
      this.ui.title.value = '';
      this.ui.artist.value = '';
      this.ui.plays.textContent = '▶ –';
      this.ui.added.textContent = '';
      this._track = null;
      this.renderTags();
      this.renderPinnedState();
      return;
    }

    try {
      var t = await dbBoss.getTrack(ytId);
      var rc = await dbBoss.getReactions(ytId);
      if (this.target !== ytId) return;        // a newer render overtook this one
      this._track = t || { ytId: ytId };

      this.ui.title.value = (t && t.name) || '';
      this.ui.artist.value = (t && t.artist) || '';
      this.ui.likeCount.textContent = rc.like;
      this.ui.dislikeCount.textContent = rc.dislike;

      var plays = 0;
      try {
        var counts = await dbBoss.getPlayCounts();
        plays = counts[ytId] || 0;
      } catch(e){ /* the count is a nicety */ }
      this.ui.plays.textContent = '▶ ' + plays;
      this.ui.plays.title = plays === 1 ? 'Played once on this device'
        : 'Played ' + plays + ' times on this device';

      this.ui.added.textContent = (t && t.createdAt)
        ? 'added ' + new Date(t.createdAt).toLocaleDateString() : '';

      /* A thumbnail straight from YouTube, which is where the video is.
         hqdefault exists for every video; maxres does not, and a missing
         maxres renders as a grey 404 image rather than failing visibly. */
      this.ui.thumb.src = 'https://i.ytimg.com/vi/' + encodeURIComponent(ytId) + '/hqdefault.jpg';
      this.ui.thumb.alt = (t && t.name) ? t.name : '';
      this.ui.yt.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(ytId);

      this.renderTags();
      this.renderPinnedState();
    } catch(e){ /* the panel is informational; never let it throw into a load */ }
  }
};
