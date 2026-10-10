/* riffrolled — aidj.js
   DJ AI: the engine behind the DJ AI menu.

   riffrolled supplies no music and calls no AI. Every track is a YouTube
   video, and the DJ is whichever AI the listener already has open. What
   this file does is turn a brief into a prompt, read whatever comes back,
   and keep what it learns.

       brief  →  prompt  →  (the listener's AI)  →  reply  →  playlist

   TEXT mode is the whole of it today: copy the brief out, paste the reply
   back. `djAi.modes` lists the other two as coming soon; when one lands it
   replaces the middle step only — the brief, the parser and the import are
   already independent of how the AI is reached.

   DJ AI does not recommend music. It takes you somewhere. The brief is a
   set of starting coordinates, not a filter, which is why Riff Roll weights
   the dice instead of constraining them, and why Chaos Mode tells the AI
   outright that a strange combination is deliberate.

   No network calls are made to resolve anything: the AI is asked to verify
   its own YouTube links, and riffrolled imports what it is given. A dead id
   simply fails on the deck, which the player already handles by skipping. */

var djAi = {

  MAX_TRACKS: 50,

  /* ── the three ways a brief can reach an AI ── */
  modes: [
    { id:'text',  label:'TEXT',        sub:'COPY + PASTE', state:'ACTIVE',
      blurb:'Build the brief, copy it, paste your AI\'s answer back.' },
    { id:'byoai', label:'YOUR AI',     sub:'BRING YOUR OWN', state:'COMING SOON',
      blurb:'Connect the AI you already pay for and skip the clipboard.' },
    { id:'riffroll', label:'RIFFROLL IT', sub:'WE HANDLE IT', state:'COMING SOON',
      blurb:'riffrolled talks to the DJ for you. One button, one journey.' }
  ],

  /* ── brief state. Picks are keyed by category key; everything here is
     persisted to settings so the menu looks the same tomorrow. ── */
  state: {
    mode: 'text',
    textMode: 'speed',    // 'speed' | 'details' — the two ways to brief
    picks: {},            // { activity: optionId, feel: optionId, … }
    familiarity: 30,      // % familiar; the rest is discovery
    chaos: false,
    count: 15,
    minutes: 60,
    maxTrackMin: 8,
    shareContext: true,
    allowPromoted: false, // opt-in: paid placements offered alongside the brief
    briefId: ''           // ties a copy back to the placements it was offered
  },

  /* Speed mode asks four things and hides the rest behind More settings.
     Anything revealed there still counts — towards the brief, and towards
     how long the DJ will take. */
  SPEED_CORE: ['activity', 'feel', 'direction', 'personality'],

  cats: [],               // categories with their options, in order

  _loading: null,

  /** One load, however many callers. The menu panel is built synchronously
      but filled from Dexie after, so anything that can be pressed before
      that finishes — the tutorial's ROLL THE RIFF button, a keyboard
      shortcut — has to wait for the same promise rather than start a second
      load or roll against a half-seeded vocabulary. Rolling mid-seed used to
      pick one category out of four and silently drop the rest. */
  ready(){ return this._loading || (this._loading = this.load()); },

  /* ── load: seed the vocabulary once, then read it back ── */
  async load(){
    await this.seed();
    await this.ensureAnyOptions();
    await this.refresh();
    try {
      var saved = await dbBoss.getSetting('djState');
      if (saved) this.state = Object.assign(this.state, JSON.parse(saved));
    } catch(e){ /* a bad saved state is not worth failing over */ }
    // anything picked that has since been deleted quietly clears
    var self = this;
    Object.keys(this.state.picks).forEach(function(k){
      if (!self.optionById(self.state.picks[k])) delete self.state.picks[k];
    });
    return this.cats;
  },

  async save(){
    try { await dbBoss.setSetting('djState', JSON.stringify(this.state)); } catch(e){}
  },

  /* first run only: copy dj-data.js into the database, after which the
     vocabulary belongs to the user.

     This used to bail out on `djCategories.count() > 0` and write the
     categories one row at a time. Eight categories and ninety options is a
     second or two of separate little writes, so a first visit cut short —
     a reload, a closed tab, a tapped link — left the vocabulary half
     written, and the count check then passed forever. The symptom was DJ AI
     coming up with one category and three options and RIFF ROLL filling a
     single line of the brief, with nothing to suggest why.

     So: one transaction, and a fill keyed on category key and option label
     rather than a "have I run before" flag. Asking the database what it is
     missing makes this idempotent, self-repairing, and true of whichever
     database it is pointed at — a stored flag would have lived in the real
     settings table and told the self-tests' throwaway database that it was
     already seeded.

     Nothing it restores can have been deliberately removed: hiding a
     built-in option sets hidden:true rather than deleting the row (and the
     labels it compares against include hidden ones), and removeCategory
     refuses built-ins outright. A category that exists is left exactly as
     it is, so one switched off under More settings stays off. */
  async seed(){
    if (typeof DJ_CATEGORIES === 'undefined') return;

    await db.transaction('rw', db.djCategories, db.djOptions, async function(){
      for (var i = 0; i < DJ_CATEGORIES.length; i++){
        var c = DJ_CATEGORIES[i];
        var cat = await db.djCategories.where('key').equals(c.key).first();
        var catId = cat ? cat.id : await db.djCategories.add({
          key: c.key, label: c.label, icon: c.icon || '🎚', order: c.order,
          enabled: c.enabled !== false, builtin: true,
          note: c.note || '', placeholder: c.placeholder || 'Pick one…'
        });
        var had = await db.djOptions.where('categoryId').equals(catId).toArray();
        var have = {};
        had.forEach(function(o){ have[o.label] = true; });
        for (var j = 0; j < c.options.length; j++){
          var o = c.options[j];
          if (have[o.label]) continue;
          await db.djOptions.add({
            categoryId: catId, label: o.label, tags: o.tags || [],
            line: o.line || '', builtin: true, hidden: false,
            favourite: 0, useCount: 0, lastTs: 0
          });
        }
      }
    });
  },

  /* "Don't mind" has to exist in every core category, including for
     listeners whose vocabulary was seeded before it did — so this runs on
     every load and only ever adds what's missing. */
  async ensureAnyOptions(){
    if (typeof DJ_ANY === 'undefined') return;
    var cats = await db.djCategories.toArray();
    for (var i = 0; i < cats.length; i++){
      var spec = DJ_ANY[cats[i].key];
      if (!spec) continue;
      var existing = await db.djOptions.where('categoryId').equals(cats[i].id).toArray();
      if (existing.some(function(o){ return o.any; })) continue;
      await db.djOptions.add({
        categoryId: cats[i].id, label: spec.label, tags: [], line: spec.line,
        builtin: true, any: true, hidden: false, favourite: 0, useCount: 0, lastTs: 0
      });
    }
  },

  /** the "you choose" option for a category, if it has one */
  anyOption(key){
    var cat = this.cat(key);
    if (!cat) return null;
    return (cat.options || []).find(function(o){ return o.any; }) || null;
  },

  /** what this category is actually saying — the pick, or "don't mind" */
  effective(key){
    return this.picked(key) || this.anyOption(key);
  },

  async refresh(){
    var cats = await db.djCategories.orderBy('order').toArray();
    for (var i = 0; i < cats.length; i++){
      cats[i].options = await db.djOptions.where('categoryId').equals(cats[i].id).toArray();
    }
    this.cats = cats;
    return cats;
  },

  cat(key){ return this.cats.find(function(c){ return c.key === key; }); },

  optionById(id){
    for (var i = 0; i < this.cats.length; i++){
      var o = (this.cats[i].options || []).find(function(x){ return x.id === id; });
      if (o) return o;
    }
    return null;
  },

  /** the option currently chosen in a category, or null */
  picked(key){
    var id = this.state.picks[key];
    return id ? this.optionById(id) : null;
  },

  /** every option chosen across every enabled category */
  chosen(){
    var self = this, out = [];
    this.cats.forEach(function(c){
      if (!c.enabled) return;
      var o = self.picked(c.key);
      if (o) out.push(o);
    });
    return out;
  },

  async pick(key, optionId){
    this.state.picks[key] = optionId;
    /* Changing a pick changes the moods, so it is a different brief and
       the next copy is a new placement. Deliberately hooked here and in
       roll() rather than in save(): the track count and the familiarity
       slider also call save(), and nudging the length from 15 to 16 is
       not a second brief and must not cost anybody a second credit. */
    this.newBrief();
    var o = this.optionById(optionId);
    if (o){   // remembering what gets used is what makes the picker useful
      await db.djOptions.update(o.id, { useCount: (o.useCount || 0) + 1, lastTs: Date.now() });
      o.useCount = (o.useCount || 0) + 1;
    }
    await this.save();
  },

  async clearPick(key){ delete this.state.picks[key]; await this.save(); },

  async setFavourite(optionId, on){
    await db.djOptions.update(optionId, { favourite: on ? 1 : 0 });
    var o = this.optionById(optionId);
    if (o) o.favourite = on ? 1 : 0;
  },

  /* ── user-owned vocabulary ── */
  async addOption(categoryId, label, tags){
    var id = await db.djOptions.add({
      categoryId: categoryId, label: String(label || '').trim().slice(0, 80),
      tags: tags || [], line: '', builtin: false, hidden: false,
      favourite: 0, useCount: 0, lastTs: 0
    });
    await this.refresh();
    return id;
  },

  // built-in options hide rather than delete, so "reset" can bring them back
  async removeOption(optionId){
    var o = this.optionById(optionId);
    if (!o) return;
    if (o.builtin) await db.djOptions.update(optionId, { hidden: true });
    else await db.djOptions.delete(optionId);
    var self = this;
    Object.keys(this.state.picks).forEach(function(k){
      if (self.state.picks[k] === optionId) delete self.state.picks[k];
    });
    await this.save();
    await this.refresh();
  },

  async updateOption(optionId, fields){
    await db.djOptions.update(optionId, fields);
    await this.refresh();
  },

  async addCategory(label, icon){
    var max = this.cats.length ? Math.max.apply(null, this.cats.map(function(c){ return c.order || 0; })) : 0;
    var key = 'c' + Date.now().toString(36);
    await db.djCategories.add({
      key: key, label: String(label || 'New section').trim().slice(0, 60),
      icon: icon || '🎚', order: max + 10, enabled: true, builtin: false,
      note: '', placeholder: 'Pick one…'
    });
    await this.refresh();
    return key;
  },

  async setCategoryEnabled(id, on){
    await db.djCategories.update(id, { enabled: !!on });
    await this.refresh();
  },

  async removeCategory(id){
    var c = this.cats.find(function(x){ return x.id === id; });
    if (!c || c.builtin) return;                      // built-ins switch off, not away
    await db.djOptions.where('categoryId').equals(id).delete();
    await db.djCategories.delete(id);
    delete this.state.picks[c.key];
    await this.save();
    await this.refresh();
  },

  /* ── RIFF ROLL ────────────────────────────────────────────────────────
     Options share tags; shared tags mean related. The roll weights the
     dice by how much an option has in common with what is already picked,
     but every option keeps a real chance — linked never means constrained,
     so Funeral + Euphoric + Death Metal stays reachable.

     Chaos inverts the weighting for some categories: it hunts for the
     options with the *least* in common. That alone would just be noise,
     so the prompt then tells the AI the collision is deliberate. ── */

  // what the dice may land on: never a hidden option, and never "don't
  // mind" — a roll that rolls "you choose" has wasted the throw
  _visible(cat){
    return (cat.options || []).filter(function(o){ return !o.hidden && !o.any; });
  },

  _tagBag(options){
    var bag = {};
    options.forEach(function(o){ (o.tags || []).forEach(function(t){ bag[t] = (bag[t] || 0) + 1; }); });
    return bag;
  },

  _weights(options, bag, invert){
    var scores = options.map(function(o){
      var shared = (o.tags || []).reduce(function(n, t){ return n + (bag[t] ? 1 : 0); }, 0);
      return shared;
    });
    var max = Math.max.apply(null, scores.concat([0]));
    return scores.map(function(s){
      // 1 is the floor that keeps an unrelated option possible
      return invert ? 1 + 2 * (max - s) : 1 + 2 * s;
    });
  },

  _sample(options, weights){
    var total = weights.reduce(function(a, b){ return a + b; }, 0);
    if (!total) return options[Math.floor(Math.random() * options.length)];
    var r = Math.random() * total;
    for (var i = 0; i < options.length; i++){
      r -= weights[i];
      if (r <= 0) return options[i];
    }
    return options[options.length - 1];
  },

  /** roll one category against everything else currently picked */
  rollOption(key, opts){
    opts = opts || {};
    var cat = this.cat(key);
    if (!cat) return null;
    var options = this._visible(cat);
    if (!options.length) return null;
    // a dice that lands on what you already had reads as broken, so a
    // single-category roll always moves (the whole-brief roll doesn't care)
    var current = this.state.picks[key];
    if (current && options.length > 1 && !opts.allowSame){
      options = options.filter(function(o){ return o.id !== current; });
    }
    var others = this.chosen().filter(function(o){ return o.categoryId !== cat.id; });
    var bag = this._tagBag(others);
    return this._sample(options, this._weights(options, bag, !!opts.invert));
  },

  async roll(key, opts){
    var o = this.rollOption(key, opts);
    if (o) await this.pick(key, o.id);
    return o;
  },

  /** roll the whole brief as one combination, not field by field.
      In speed mode that means the four questions on screen — rolling
      something the listener can't see would be a brief they never read,
      so anything they opened under More settings keeps what they chose. */
  async rollAll(opts){
    opts = opts || {};
    var chaos = !!opts.chaos;
    var self = this;
    var speed = this.state.textMode === 'speed';
    var cats = this.cats.filter(function(c){
      return c.enabled && (!speed || self.SPEED_CORE.indexOf(c.key) >= 0);
    });
    if (!cats.length) return;

    // a random anchor each time, so no category is permanently in charge
    cats = cats.slice().sort(function(){ return Math.random() - 0.5; });

    var picked = [];
    // under chaos at least one category deliberately goes against the grain
    var oddOne = chaos ? Math.floor(Math.random() * cats.length) : -1;

    cats.forEach(function(c, i){
      var options = self._visible(c);
      if (!options.length) return;
      var bag = self._tagBag(picked);
      var invert = chaos && (i === oddOne || Math.random() < 0.4);
      var o = self._sample(options, self._weights(options, bag, invert));
      if (o){ picked.push(o); self.state.picks[c.key] = o.id; }
    });

    this.state.chaos = chaos;
    this.newBrief();            // a roll is a new brief — see pick()
    // the slider moves with a details-mode roll, in sane steps rather than
    // to a random integer. In speed mode it lives under More settings, so
    // a roll leaves whatever the listener set there alone.
    if (!opts.keepFamiliarity && !speed){
      var steps = [0, 10, 20, 30, 50, 70, 90, 100];
      this.state.familiarity = steps[Math.floor(Math.random() * steps.length)];
    }
    await this.save();
    return picked;
  },

  /* ── the brief, as one line (what the menu shows) ── */
  briefLine(){
    var self = this, bits = [];
    this.cats.forEach(function(c){
      if (!c.enabled) return;
      var o = self.picked(c.key);
      if (o) bits.push(o.label);
    });
    // speed mode only sends familiarity when it has been moved off the
    // default, so the preview must not promise it either
    if (this.state.textMode !== 'speed' || this.state.familiarity !== 30){
      bits.push(this.state.familiarity + '% familiar / ' + (100 - this.state.familiarity) + '% discovery');
    }
    bits.push(this.state.count + ' tracks · ' + this.state.minutes + ' min');
    if (this.state.chaos) bits.push('CHAOS');
    return bits.join(' | ');
  },

  /* ── what the DJ is allowed to know about the listener ──
     Local data, shown in full in the menu before it goes anywhere, and
     switched off with one toggle. Nothing is sent by riffrolled: the
     listener pastes it themselves. ── */
  async context(){
    var out = { top: [], liked: [], recent: [], tags: [], have: [], size: 0 };
    try {
      var tracks = await db.tracks.toArray();
      out.size = tracks.length;
      if (!tracks.length) return out;

      var counts = await dbBoss.getPlayCounts();
      var byYt = {};
      tracks.forEach(function(t){ byYt[t.ytId] = t; });
      var label = function(t){ return (t.artist ? t.artist + ' — ' : '') + (t.name || t.ytId); };

      out.top = tracks.slice()
        .sort(function(a, b){ return (counts[b.ytId] || 0) - (counts[a.ytId] || 0); })
        .filter(function(t){ return (counts[t.ytId] || 0) > 0; })
        .slice(0, 12).map(function(t){ return label(t) + ' (' + counts[t.ytId] + ')'; });

      var likes = {};
      (await db.reactions.where('kind').equals('like').toArray())
        .forEach(function(r){ likes[r.ytId] = (likes[r.ytId] || 0) + 1; });
      out.liked = Object.keys(likes)
        .sort(function(a, b){ return likes[b] - likes[a]; }).slice(0, 10)
        .map(function(y){ return byYt[y] ? label(byYt[y]) : null; }).filter(Boolean);

      var hist = await db.playHistory.orderBy('ts').reverse().limit(40).toArray();
      var seen = {};
      hist.forEach(function(h){
        if (seen[h.ytId] || !byYt[h.ytId] || out.recent.length >= 10) return;
        seen[h.ytId] = 1;
        out.recent.push(label(byYt[h.ytId]));
      });

      var tagCount = {};
      tracks.forEach(function(t){
        (t.tags || '').split(',').forEach(function(raw){
          var tag = raw.trim().toLowerCase();
          if (tag) tagCount[tag] = (tagCount[tag] || 0) + 1;
        });
      });
      out.tags = Object.keys(tagCount)
        .sort(function(a, b){ return tagCount[b] - tagCount[a]; }).slice(0, 14);

      var artists = {};
      tracks.forEach(function(t){ if (t.artist) artists[t.artist.trim()] = 1; });
      out.have = Object.keys(artists).slice(0, 60);
    } catch(e){ /* context is a bonus */ }
    return out;
  },

  /* ── the prompt ──────────────────────────────────────────────────────
     Two of them, because speed and detail want genuinely different things
     from an AI. Speed says "decide and move"; details says "take me
     somewhere". Same brief underneath, same reply format to parse. ── */
  async buildPrompt(){
    return this.state.textMode === 'speed'
      ? await this.buildSpeedPrompt()
      : await this.buildDetailsPrompt();
  },

  /* ── promoted placements ─────────────────────────────────────────────
     Off by default and opt-in, because a brief is something the listener
     is about to hand to someone else; putting advertising in it without
     being asked would be a different product.

     The money moves on COPY, not on import. Copying is the moment the
     promoted track has definitely been in front of a person — it is in
     their clipboard and on its way to an AI. Whether the AI keeps it, and
     whether they then import the result, is a measure of how well the
     placement worked rather than the thing being paid for. Charging on
     import would also mean an AI that quietly dropped the track cost the
     promoter nothing for attention that was genuinely spent.

     The brief id is what makes copying the same brief twice free. It
     survives until the brief changes: a new roll is a new brief and a new
     placement, re-copying the same one is not. ── */

  /** A fresh brief id, so the next copy is a new placement. */
  newBrief(){
    var a = new Uint8Array(16);
    crypto.getRandomValues(a);
    this.state.briefId = [].map.call(a, function(b){
      return b.toString(16).padStart(2, '0');
    }).join('');
    this._promoted = null;
    return this.state.briefId;
  },

  briefId(){ return this.state.briefId || this.newBrief(); },

  /**
   * The moods this brief is asking for: the union of the tags on every
   * option it picked.
   *
   * This is the whole matching mechanism. The DJ's own vocabulary is
   * tagged from the same closed list the server validates a promoter
   * against (src/tags.js), so "Night drive · Dark · Electronic" becomes
   * a set of words a campaign can be matched on. A promoter free to
   * invent tags would match nothing.
   */
  briefTags(){
    var self = this, out = [];
    this.cats.forEach(function(c){
      if (!c.enabled) return;
      var o = self.speed() ? self.effective(c.key) : self.picked(c.key);
      if (!o || !o.tags) return;
      o.tags.forEach(function(t){ if (out.indexOf(t) < 0) out.push(t); });
    });
    return out;
  },

  speed(){ return this.state.textMode === 'speed'; },

  /** Ask the server which campaigns fit this brief. Charges nothing. */
  async fetchPromoted(){
    if (!this.state.allowPromoted) return [];
    var tags = this.briefTags();
    if (!tags.length) return [];
    try {
      var r = await fetch('/api/promotions/brief', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brief_id: this.briefId(), tags: tags })
      });
      if (!r.ok) return [];
      var d = await r.json();
      this._promoted = d.promotions || [];
      return this._promoted;
    } catch(e){
      // offline, or the endpoint is unhappy: the brief goes out without
      // placements rather than not going out
      return [];
    }
  },

  /** Spend one credit per placement. Called when the brief is copied. */
  async claimPromoted(){
    if (!this.state.allowPromoted || !this.state.briefId) return 0;
    if (!this._promoted || !this._promoted.length) return 0;
    try {
      var r = await fetch('/api/promotions/brief/claim', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brief_id: this.state.briefId })
      });
      if (!r.ok) return 0;
      var d = await r.json();
      return d.charged || 0;
    } catch(e){ return 0; }
  },

  /** The PROMOTED TRACKS section, or '' when there is nothing to say. */
  async promotedBlock(){
    var list = await this.fetchPromoted();
    if (!list.length || typeof DJ_PROMOTED_BLOCK === 'undefined') return '';
    var lines = list.map(function(p, i){
      var moods = (p.tags || []).join(', ');
      return (i + 1) + '. ' + (p.name || p.label || p.url) +
        '\n   ' + p.url + (moods ? '\n   tagged: ' + moods : '');
    }).join('\n');
    return DJ_PROMOTED_BLOCK.replace('{{promoted_list}}', lines);
  },

  /** the line a category contributes to a brief */
  _briefLineFor(key){
    var o = this.effective(key);
    if (!o) return 'Your choice.';
    return o.any ? (o.line || o.label) : o.label;
  },

  async buildSpeedPrompt(){
    var self = this, s = this.state;
    var tpl = (typeof DJ_SPEED_PROMPT !== 'undefined') ? DJ_SPEED_PROMPT : '';

    /* Anything opened under More settings joins THE BRIEF as its own
       question, in the same shape as the four on screen — otherwise those
       controls would be decoration. Discovery and familiarity are the
       exception: they get their own section below, because the brief for
       "how far from home" needs more than a label. */
    var extras = [];
    this.cats.forEach(function(c){
      if (!c.enabled || self.SPEED_CORE.indexOf(c.key) >= 0 || c.key === 'discovery') return;
      var o = self.picked(c.key);
      if (!o) return;
      extras.push('\n' + c.label + '\n' + (o.line || o.label));
    });
    if (s.chaos && typeof DJ_CHAOS_LINES !== 'undefined'){
      extras.push('\nCHAOS\n' + DJ_CHAOS_LINES[Math.floor(Math.random() * DJ_CHAOS_LINES.length)]);
    }
    var extrasBlock = extras.length ? extras.join('\n') + '\n' : '';

    /* DISCOVERY appears when there is something to say: a discovery brief,
       or a familiarity the listener has actually moved. Left alone, the DJ
       decides — which is what speed mode is for. */
    var disc = this.picked('discovery');
    var famMoved = s.familiarity !== 30;
    var discoveryBlock = '';
    if ((disc || famMoved) && typeof DJ_DISCOVERY_BLOCK !== 'undefined'){
      var famBlock = '';
      if (famMoved && typeof DJ_FAMILIARITY_BLOCK !== 'undefined'){
        famBlock = DJ_FAMILIARITY_BLOCK
          .replace('{{familiar_pct}}', String(s.familiarity))
          .replace('{{discovery_pct}}', String(100 - s.familiarity));
      }
      discoveryBlock = DJ_DISCOVERY_BLOCK
        .replace('{{discovery_line}}', disc ? (disc.line || disc.label)
          : 'No particular discovery brief — the familiarity below is the whole of it.')
        .replace('{{familiarity}}', famBlock);
    }

    // speed mode shares the top ten and nothing else
    var listening = '';
    if (s.shareContext){
      var top = await this.topTracks(10);
      if (top.length){
        listening = (typeof DJ_SPEED_LISTENING !== 'undefined' ? DJ_SPEED_LISTENING : '')
          .replace('{{top_10_tracks}}', top.map(function(t, i){ return (i + 1) + '. ' + t; }).join('\n'));
      }
    }

    var promoted = await this.promotedBlock();

    return tpl
      .replace('{{promoted}}',           promoted)
      .replace('{{activity}}',           this._briefLineFor('activity'))
      .replace('{{feeling}}',            this._briefLineFor('feel'))
      .replace('{{direction}}',          this._briefLineFor('direction'))
      .replace('{{dj_personality}}',     this._briefLineFor('personality'))
      .replace('{{extras}}',             extrasBlock)
      .replace('{{discovery}}',          discoveryBlock)
      .replace('{{listening}}',          listening)
      .replace(/\{\{track_count\}\}/g,   String(s.count))
      .replace('{{target_minutes}}',     String(s.minutes))
      .replace('{{max_track_minutes}}',  String(s.maxTrackMin));
  },

  /** most-played, as "Artist — Title (23 plays)" */
  async topTracks(n){
    try {
      var counts = await dbBoss.getPlayCounts();
      var tracks = await db.tracks.toArray();
      return tracks
        .filter(function(t){ return (counts[t.ytId] || 0) > 0; })
        .sort(function(a, b){ return (counts[b.ytId] || 0) - (counts[a.ytId] || 0); })
        .slice(0, n || 10)
        // "Artist - Title", the way a tracklist reads. No play counts: the
        // order already says which ones get played most.
        .map(function(t){
          return (t.artist ? t.artist + ' - ' : '') + (t.name || t.ytId);
        });
    } catch(e){ return []; }
  },

  async buildDetailsPrompt(){
    var self = this, s = this.state, L = [];
    var personality = this.picked('personality');
    var perLine = personality && personality.line ? personality.line
      : (personality ? 'You are "' + personality.label + '" — let that colour how you present the set.' : '');

    L.push('You are my DJ.');
    L.push('');
    L.push('You are not recommending music and you are not making music. You are taking me');
    L.push('somewhere. Everything I listen to plays from YouTube, so the set you write is a');
    L.push('list of YouTube videos.');
    if (perLine){ L.push(''); L.push(perLine); }
    L.push('');

    L.push('THE BRIEF');
    this.cats.forEach(function(c){
      if (!c.enabled) return;
      var o = self.picked(c.key);
      if (!o) return;
      L.push('  ' + c.label + ' ' + o.label);
      if (o.line) L.push('      ' + o.line);
    });

    var fam = s.familiarity;
    L.push('  Familiarity: roughly ' + fam + '% things I might know, ' + (100 - fam) + '% discovery.');
    L.push('      Treat that as a feel, not arithmetic.');
    if (this.picked('direction')){
      L.push('  The direction above is a starting coordinate, not a genre filter. Wander from it');
      L.push('      if the journey is better for it.');
    }
    if (s.chaos){
      L.push('');
      L.push('  ' + DJ_CHAOS_LINES[Math.floor(Math.random() * DJ_CHAOS_LINES.length)]);
    }
    L.push('');

    L.push('LENGTH AND TIME');
    L.push('  Exactly ' + s.count + ' tracks.');
    L.push('  The whole set should run about ' + s.minutes + ' minutes, so aim for an average of');
    L.push('      roughly ' + this.avgMinutes() + ' minutes a track.');
    L.push('  No single track longer than ' + s.maxTrackMin + ' minutes. If a track you want is longer');
    L.push('      than that, pick a different one — not a shortened edit of the same thing.');
    L.push('');

    if (s.shareContext){
      var ctx = await this.context();
      if (ctx.size){
        L.push('WHAT I ALREADY LISTEN TO');
        if (ctx.top.length){    L.push('  Played most: ' + ctx.top.join('; ')); }
        if (ctx.liked.length){  L.push('  Liked: ' + ctx.liked.join('; ')); }
        if (ctx.recent.length){ L.push('  Recent: ' + ctx.recent.join('; ')); }
        if (ctx.tags.length){   L.push('  My tags: ' + ctx.tags.join(', ')); }
        if (ctx.have.length){
          L.push('  Already in my library, so nothing here counts as a discovery:');
          L.push('      ' + ctx.have.join(', '));
        }
        L.push('');
      }
    } else {
      L.push('I have not shared my listening history. Choose blind.');
      L.push('');
    }

    // paid placements, same block as speed mode and on the same terms
    var promotedBlock = await this.promotedBlock();
    if (promotedBlock){ L.push(promotedBlock.trim()); L.push(''); }

    L.push('REPLY IN THIS EXACT FORMAT. I paste your whole reply straight back into riffrolled,');
    L.push('so put nothing before or after the block:');
    L.push('');
    L.push('RIFFROLLED-PLAYLIST');
    L.push('NAME: a short name for this set');
    L.push('1 | Artist | Track title | YouTube URL | 4:12 | genre | why it is here');
    L.push('2 | Artist | Track title | YouTube URL | 3:48 | genre | why it is here');
    L.push('END');
    L.push('');
    L.push('Rules:');
    L.push('  - One track per line, numbered, in the order I should hear them.');
    L.push('  - Artist, title, link, running time (m:ss), genre, and a few words on why it earns');
    L.push('    its place in this journey.');
    L.push('  - Real, released tracks by real artists. Do not invent songs. Do not repeat a track.');
    L.push('  - No commentary outside the block.');
    L.push('');
    /* This block used to say every track MUST have a URL and that the
       playlist was incomplete without one for all of them. Read beside
       the instruction not to invent ids, that is a contradiction, and an
       AI resolves it the way the stronger wording points: it fills every
       cell, with a Bandcamp page, an album link, or a video id it has
       already used. A fifteen-track reply then imports as four. The rule
       is the same as it always was — never invent a link — but the
       requirement it was fighting with is gone. */
    L.push('YOUTUBE LINKS');
    L.push('riffrolled plays YouTube videos and nothing else. A Bandcamp, Spotify,');
    L.push('SoundCloud or Apple Music link cannot be played and the track is dropped.');
    L.push('');
    L.push('Give exactly ' + s.count + ' TRACKS. You do NOT need ' + s.count + ' URLs.');
    L.push('A track with an EMPTY url cell is complete and correct — riffrolled looks it');
    L.push('up from the artist and title. Completeness is counted in tracks, never links.');
    L.push('');
    L.push('A wrong link is far worse than no link: it costs the listener that song');
    L.push('silently, and they get a playlist shorter than the one you wrote.');
    L.push('');
    L.push('For EACH track:');
    L.push('  1. Search YouTube/web for the exact Artist + Track Title.');
    L.push('  2. Find a real YouTube result for that exact recording.');
    L.push('  3. Verify that the result matches the exact artist, the exact track title, and the');
    L.push('     intended recording or version.');
    L.push('  4. Copy the actual watch URL from the search result.');
    L.push('  5. Never construct a YouTube URL yourself.');
    L.push('  6. Never invent, guess, or recall a YouTube video ID.');
    L.push('  7. Never use a different song, remix, cover, live version, lyric video, or similarly');
    L.push('     titled track unless it is clearly the intended recording.');
    L.push('  8. Prefer the official artist or channel upload when available.');
    L.push('  9. Otherwise use another legitimate upload that clearly contains the exact track.');
    L.push(' 10. Repeat the search if the first result is unsuitable.');
    L.push('');
    L.push('HARD REQUIREMENT');
    L.push('Return exactly ' + s.count + ' tracks.');
    L.push('Every URL you DO give must come from an actual search result made during this');
    L.push('request. Never rely on memory — a plausible-looking URL is not acceptable, and');
    L.push('never give the same video id for two different tracks.');
    L.push('');
    L.push('If a track cannot be confidently matched to a real YouTube result, you may either');
    L.push('replace it with another track you can verify, or keep it and leave its url cell');
    L.push('empty. Both are correct. What is not correct is filling the cell with something');
    L.push('that is not a YouTube video, or with an id you used for another track.');
    L.push('');
    L.push('JSON is also accepted if you prefer:');
    L.push('  {"name":"...","tracks":[{"artist":"...","title":"...","url":"https://www.youtube.com/watch?v=VIDEOID",' +
           '"duration":"4:12","genre":"...","why":"..."}]}');

    return L.join('\n');
  },

  avgMinutes(){
    var avg = this.state.minutes / Math.max(this.state.count, 1);
    return Math.round(avg * 10) / 10;
  },

  /* ── how long the DJ will take ───────────────────────────────────────
     An estimate, and shown as one. Speed mode is quick because it asks
     for less thought; details mode asks for a reason per track. Anything
     opened under More settings is another thing to weigh, so the number
     goes up — which is the honest trade for the extra control. ── */
  estimateSecs(){
    var T = (typeof DJ_TIME !== 'undefined') ? DJ_TIME : {
      speedPerTrack:4, detailsPerTrack:10, extraCategory:10, shareContext:15,
      chaosMultiplier:1.25, minimum:30
    };
    var speed = this.state.textMode === 'speed';
    var secs = this.state.count * (speed ? T.speedPerTrack : T.detailsPerTrack);

    // every brief line beyond the core four is another consideration
    var self = this, extras = 0;
    this.cats.forEach(function(c){
      if (!c.enabled) return;
      if (self.SPEED_CORE.indexOf(c.key) >= 0) return;
      if (self.picked(c.key)) extras++;
    });
    secs += extras * T.extraCategory;
    if (this.state.shareContext) secs += T.shareContext;
    if (this.state.familiarity <= 20) secs += T.extraCategory;   // real digging
    if (this.state.chaos) secs *= T.chaosMultiplier;
    return Math.max(Math.round(secs), T.minimum);
  },

  /** "≈ 1 min" / "≈ 2½ min" — half-minutes, because pretending to know
      it to the second would be a lie */
  estimateLabel(){
    var secs = this.estimateSecs();
    if (secs < 60) return '≈ under a minute';
    var halves = Math.round(secs / 30) / 2;
    var whole = Math.floor(halves);
    var frac = halves - whole === 0.5 ? '½' : '';
    return '≈ ' + (whole || '') + frac + ' min';
  },

  /* ── parsing ─────────────────────────────────────────────────────────
     Whatever a stranger's AI felt like writing: the pipe block, JSON, a
     markdown table, a numbered list of "Artist - Title". Cells are
     identified by what they look like rather than by position, because
     models drop and reorder them. Never throws; an empty items array is
     the "couldn't read it" signal. ── */
  /** every YouTube link in a blob of text, in order */
  LINK_RE: /(?:[?&]v=|youtu\.be\/|\/(?:shorts|embed)\/)([A-Za-z0-9_-]{11})/g,

  _linkCount(s){
    this.LINK_RE.lastIndex = 0;
    var n = 0;
    while (this.LINK_RE.exec(s)) n++;
    this.LINK_RE.lastIndex = 0;
    return n;
  },

  /**
   * Put the line breaks back into a reply that lost them.
   *
   * This is the bug that made DJ AI look broken: a reply copied out of a
   * rendered answer rather than a code block often arrives as one long
   * line, and the parser is line-oriented, so one line meant one track.
   * You got a playlist with a single song and no clue why. It happens far
   * more on phones, where selecting rendered text is what you have.
   *
   * The brief dictates the format — `n | Artist | Title | URL | time |
   * genre` — so the track boundary is a small number followed by a pipe,
   * a dot or a bracket. Anchoring on the delimiter immediately after the
   * digits is what keeps it off durations: in "3:40 | synth 2 | Artist",
   * the only cut is before "2 |", because the 40 in 3:40 is followed by a
   * space-pipe but is not preceded by whitespace, and 220 is not followed
   * by a delimiter at all.
   *
   * It only runs when the text really does look flattened — two or more
   * links with at most one line carrying one — and it keeps its work only
   * if the result is an improvement. A repair that makes things worse is
   * worse than no repair.
   */
  _unflatten(raw){
    var links = this._linkCount(raw);
    if (links < 2) return raw;

    var self = this;
    var carrying = raw.split(/\r?\n/).filter(function(l){ return self._linkCount(l) > 0; }).length;
    if (carrying >= 2) return raw;              // already one per line

    /* Only cut where the index CONTINUES THE SEQUENCE. "n | Artist" is
       not a rare enough shape to anchor on by itself — an artist called
       Blink 182, or a title ending in a year, puts a number before a pipe
       in the middle of a track and splits it in half. Track indices, by
       contrast, run 1, 2, 3; so the second track begins at the "2" that
       comes after the first cut, and a stray "1 |" inside it is ignored
       because 1 is not the number being looked for. */
    /* `^|\s+` matters: track 1 is usually the very first thing in the
       text, with no whitespace in front of it. Without the start anchor
       the scanner never found index 1, kept looking for it, and matched
       the "1" in "Song 1 |" halfway through the first track — splitting
       it in two and promoting the genre to an artist. */
    var re = /(?:^|\s+)(\d{1,2})\s*[|.)]\s/g;
    var expect = 1, cuts = [], m;
    while ((m = re.exec(raw))){
      if (+m[1] !== expect) continue;
      cuts.push(m.index);
      expect++;
      // the next search starts after this delimiter, never inside it
      re.lastIndex = m.index + m[0].length - 1;
    }
    if (cuts.length < 2) return raw;

    var parts = [], at = 0;
    cuts.forEach(function(c){ parts.push(raw.slice(at, c)); at = c; });
    parts.push(raw.slice(at));
    var cut = parts.map(function(s){ return s.trim(); }).filter(Boolean).join('\n');

    /* Keep the repair only if every link ended up on a line of its own.
       Anything less means the guess was wrong, and a half-split reply
       parses worse than the flattened one it came from. */
    var after = cut.split(/\r?\n/).filter(function(l){ return self._linkCount(l) === 1; }).length;
    return after === links ? cut : raw;
  },

  parseReply(text){
    var raw = String(text || '').trim();
    if (!raw) return { name:'', items:[], linksSeen:0 };
    raw = raw.replace(/^\s*```[a-zA-Z]*\s*/gm, '').replace(/```\s*$/gm, '');

    var out = this._parseJson(raw);
    if (!out.items.length) out = this._parseLines(this._unflatten(raw));
    out.items = this._dedupe(out.items).slice(0, this.MAX_TRACKS);

    /* How many links the reply contained, whatever we managed to read.
       The import can then tell the difference between "your AI only gave
       me one track" and "I could only read one of the twelve tracks in
       there", which are the same screen to the listener and completely
       different problems. */
    out.linksSeen = this._linkCount(raw);
    return out;
  },

  _clean(s){
    return String(s == null ? '' : s)
      // a markdown link is the text somebody meant, wrapped in syntax they
      // did not: [Song](https://…) was coming through as "[Song](" once the
      // url had been pulled out of the cell
      .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1')
      .replace(/\[([^\]]+)\]\(?\s*$/g, '$1')
      .replace(/\s+/g, ' ').trim()
      .replace(/^["'`*_\s]+|["'`*_\s]+$/g, '');
  },

  _ytId(s){
    return this._ytUrlId(s) || this._bareId(s);
  },

  /** a link, not a guess: only the URL forms */
  _ytUrlId(s){
    var m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(s)
         || /youtu\.be\/([A-Za-z0-9_-]{11})/.exec(s)
         || /\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})/.exec(s);
    return m ? m[1] : null;
  },

  /* A bare 11-character id is indistinguishable from an 11-character
     word, and song titles are full of those — "Gamesofluck" by Parcels is
     exactly eleven. So this is only ever used where a link is expected,
     never on a cell that could be an artist or a title. */
  _bareId(s){
    var m = /^([A-Za-z0-9_-]{11})$/.exec(String(s || '').trim());
    return m ? m[1] : null;
  },

  /** "4:12" / "1:02:30" / "4m12s" / "252" → seconds, or 0 */
  _secs(s){
    var t = String(s || '').trim();
    var m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
    if (m){
      return m[3] ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
    }
    m = /^(\d{1,3})\s*m(?:in)?(?:\s*(\d{1,2})\s*s)?$/i.exec(t);
    if (m) return (+m[1]) * 60 + (m[2] ? +m[2] : 0);
    m = /^(\d{2,4})$/.exec(t);                 // bare seconds
    if (m && +m[1] >= 30 && +m[1] <= 3600) return +m[1];
    return 0;
  },

  _looksLikeDuration(s){ return this._secs(s) > 0 && /[:ms]/i.test(String(s)); },

  /* Is this cell a genre or a reason? It matters because speed mode's
     format ends with a genre and the older one ended with a reason, and
     both arrive as a single trailing cell. Word shape alone can't tell
     "indie rock" from "soft entry", so: recognise the vocabulary. */
  GENRE_WORDS: ('rock pop jazz funk soul blues metal punk indie folk country disco house techno trance ' +
    'ambient electronic electronica edm dnb jungle garage grime dub reggae ska dancehall afrobeat ' +
    'hiphop rap trap drill rnb gospel classical orchestral opera choral baroque romantic minimalism ' +
    'experimental noise industrial gothic shoegaze psychedelic psych prog krautrock surf swing bebop ' +
    'bossa samba salsa cumbia flamenco fado qawwali gamelan highlife soukous ' +
    'lofi chillout downtempo triphop breakbeat hardcore hardstyle gabber acid ' +
    'synthwave vaporwave darkwave coldwave newwave postpunk postrock mathrock emo grunge ' +
    'bluegrass americana soundtrack score instrumental acoustic world fusion').split(' '),

  _looksLikeGenre(s){
    var t = String(s || '').trim();
    if (!t || t.length > 28) return false;
    if (/[.!?,;]/.test(t)) return false;              // a sentence is a reason
    if (t.split(/\s+/).length > 3) return false;      // so is a phrase

    var words = t.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
    var known = this.GENRE_WORDS;
    return words.some(function(w){
      if (known.indexOf(w) >= 0) return true;
      // the suffixes that make a genre out of anything
      return /(core|wave|step|tronica|punk|beat|billy|funk|hop|metal|jazz|pop|rock)$/.test(w) && w.length > 4;
    });
  },

  /* Same song twice in one reply keeps ONE copy — and specifically the
     copy that has a link. The first-wins version threw away a playable
     track whenever an AI listed a song once without a link and again
     with one, which is exactly what a reply full of Bandcamp links does:
     "A.L.I.S.O.N & Krosia — Spirit" appeared at 7 with a Bandcamp url
     and at 15 with a YouTube one, and riffrolled kept the Bandcamp. */
  _dedupe(items){
    var at = {}, out = [];
    items.forEach(function(it){
      if (!it || (!it.title && !it.artist)) return;
      var key = (it.artist + '|' + it.title).toLowerCase();
      if (at[key] === undefined){
        at[key] = out.length;
        out.push(it);
        return;
      }
      var kept = out[at[key]];
      if (!kept.url && it.url) out[at[key]] = it;      // the one that can play wins
    });
    return out;
  },

  _blank(){ return { artist:'', title:'', url:'', secs:0, genre:'', why:'' }; },

  _parseJson(raw){
    var self = this, res = { name:'', items:[] };
    var starts = [raw.indexOf('{'), raw.indexOf('[')].filter(function(i){ return i >= 0; });
    if (!starts.length) return res;
    var from = Math.min.apply(null, starts);
    var to = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    if (to <= from) return res;
    var obj;
    try { obj = JSON.parse(raw.slice(from, to + 1)); } catch(e){ return res; }

    var list = Array.isArray(obj) ? obj
      : (Array.isArray(obj.tracks) ? obj.tracks
      : (Array.isArray(obj.playlist) ? obj.playlist
      : (Array.isArray(obj.items) ? obj.items : null)));
    if (!list) return res;
    if (!Array.isArray(obj) && obj.name) res.name = self._clean(obj.name);

    list.forEach(function(row){
      if (typeof row === 'string'){
        var d = self._splitDash(row);
        if (d) res.items.push(d);
        return;
      }
      if (!row || typeof row !== 'object') return;
      var it = self._blank();
      it.title  = self._clean(row.title || row.track || row.song || row.name);
      it.artist = self._clean(row.artist || row.by || row.channel || row.band);
      it.url    = self._ytId(row.url || row.link || row.youtube || row.videoId || row.id || '') || '';
      it.secs   = self._secs(row.duration || row.length || row.time || row.runtime || '');
      it.genre  = self._clean(row.genre || row.style || '');
      it.why    = self._clean(row.why || row.reason || row.note || row.comment || '');
      if (it.title || it.artist) res.items.push(it);
    });
    return res;
  },

  _splitDash(line){
    var m = /^(.{1,120}?)\s+[-–—]\s+(.+)$/.exec(this._clean(line));
    if (!m) return null;
    var it = this._blank();
    it.artist = this._clean(m[1]);
    it.title = this._clean(m[2]);
    return it;
  },

  _parseLines(raw){
    var self = this, res = { name:'', items:[] };

    raw.split(/\r?\n/).forEach(function(line){
      var l = line.trim();
      if (!l) return;

      var nameM = /^#*\s*(?:NAME|PLAYLIST|TITLE|SET)\s*[:\-]\s*(.+)$/i.exec(l);
      if (nameM && !res.name){ res.name = self._clean(nameM[1]); return; }
      if (/^(RIFFROLLED-PLAYLIST|END)\s*$/i.exec(l)) return;

      var body = l.replace(/^\s*(?:[-*•]\s*)?(?:\d{1,2}\s*[\.\)\:]\s*|\d{1,2}\s+[-–—]\s+)?/, '');

      if (body.indexOf('|') >= 0){
        var cells = body.split('|').map(function(c){ return self._clean(c); });
        if (!cells[0] && cells.length > 1) cells.shift();          // markdown table edge
        if (cells.length && !cells[cells.length - 1]) cells.pop();
        if (!cells.length) return;
        if (cells.every(function(c){ return /^:?-{2,}:?$/.test(c); })) return;   // table rule
        if (/^\d{1,2}$/.test(cells[0]) && cells.length > 2) cells.shift();       // index cell
        if (/^(artist|#|no\.?)$/i.test(cells[0])) return;                        // table header

        var it = self._blank(), rest = [];

        // find the link first, and only in a cell that holds a URL. A bare
        // id is accepted afterwards, and never from the first two cells —
        // those are the artist and the title, and a title like
        // "Gamesofluck" is eleven characters of pure coincidence.
        var linkAt = -1;
        for (var ci = 0; ci < cells.length; ci++){
          var urlId = self._ytUrlId(cells[ci]);
          if (urlId){ it.url = urlId; linkAt = ci; break; }
        }
        if (linkAt < 0){
          for (var cj = 2; cj < cells.length; cj++){
            var bare = self._bareId(cells[cj]);
            if (bare){ it.url = bare; linkAt = cj; break; }
          }
        }

        cells.forEach(function(c, i){
          if (!c || i === linkAt) return;
          if (!it.secs && self._looksLikeDuration(c)){ it.secs = self._secs(c); return; }
          rest.push(c);
        });
        it.artist = rest.shift() || '';
        it.title  = rest.shift() || '';
        if (!it.title && it.artist){
          var d = self._splitDash(it.artist);
          if (d){ it.artist = d.artist; it.title = d.title; }
        }
        // what's left is the genre, the reason, or both. Speed mode ends
        // on a genre and the longer format ends on a reason, so a single
        // trailing cell is decided by whether it reads as a genre.
        if (rest.length === 1){
          if (self._looksLikeGenre(rest[0])) it.genre = rest[0];
          else it.why = rest[0];
        } else if (rest.length){
          if (self._looksLikeGenre(rest[0])) it.genre = rest.shift();
          it.why = rest.join(' · ');
        }
        if (it.title || it.artist) res.items.push(it);
        return;
      }

      var urlM = /(https?:\/\/\S+)/.exec(body);
      var id2 = urlM ? self._ytId(urlM[1]) : null;
      var textPart = urlM ? body.replace(urlM[1], '').replace(/[\s\-–—|]+$/, '') : body;

      /* A line that is nothing but a link belongs to the track above it.
         Plenty of AIs lay a set out as "1. Artist — Title" with the URL
         indented underneath, and reading that as its own entry produced a
         list of titles with no links and a list of links with no titles —
         so importPlaylist, which drops anything without a url, threw the
         whole reply away. */
      if (id2 && !self._clean(textPart)){
        var prev = res.items[res.items.length - 1];
        if (prev && !prev.url){ prev.url = id2; return; }
      }

      var dash = self._splitDash(textPart);
      if (dash){ dash.url = id2 || ''; res.items.push(dash); }
    });

    return res;
  },

  /* ── checking the links ──────────────────────────────────────────────
     An AI will tell you it searched YouTube and then hand you fifteen
     video ids it made up — measured, not assumed: a real Gemini reply
     scored 0 out of 15. The artists and titles were all correct; only the
     links were fiction.

     So every link gets checked before anything is imported. YouTube's
     oEmbed endpoint needs no key and spends no API quota, returns 404 for
     a video that doesn't exist, and hands back the real title and channel
     for one that does — which is also how a link that points at the wrong
     song gets caught. The track then carries what YouTube says it is,
     not what the AI claimed.

     Runs in the browser, one request per track, and degrades to "assume
     it's fine" if the network is down rather than blocking the import. */
  async checkLinks(items, onProgress){
    var report = { checked:0, live:0, dead:0, renamed:0, offline:false };
    var progress = onProgress || function(){};
    for (var i = 0; i < items.length; i++){
      var it = items[i];
      it.dead = false;
      if (!it.url) continue;
      progress(i + 1, items.length, it.title || it.artist);
      var v = await this.oembed(it.url);
      report.checked++;
      if (v === 'offline'){ report.offline = true; continue; }
      if (!v){ it.dead = true; report.dead++; continue; }
      report.live++;
      // Keep what YouTube says alongside what the AI said, rather than
      // replacing it: a video title is "Cannons - Fire For You (Official
      // Audio) [4K]" where the AI gave a clean artist and title. The clean
      // pair is better to read, to search by and to store; YouTube's
      // version is the check on whether the link plays the right thing.
      it.ytTitle = v.name || '';
      it.ytChannel = v.artist || '';
      if (v.name && !this.linkMatches(it, v)){
        it.mismatch = v.name;
        report.mismatched++;
      }
    }
    return report;
  },

  /* Does the video the link points at look like the track that was asked
     for? Titles carry noise and channels are named all sorts of things, so
     this is a "roughly the right song" test, not an exact match. */
  linkMatches(it, v){
    var hay = this._matchNorm((v.name || '') + ' ' + (v.artist || ''));
    var want = this._matchNorm(it.title || '').split(' ').filter(function(w){ return w.length > 1; });
    if (!want.length) return true;
    var hit = want.filter(function(w){ return hay.indexOf(w) >= 0; }).length / want.length;
    return hit >= 0.6;
  },

  _matchNorm(s){
    return String(s || '').toLowerCase()
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(/\b(official|video|audio|lyrics?|visuali[sz]er|hd|hq|4k|remaster(?:ed)?|feat|ft|topic)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  },

  /** YouTube's oEmbed endpoint: no key, no API quota. null = no such
      video, 'offline' = we couldn't tell, object = it's real. */
  async oembed(ytId){
    try {
      var r = await fetch('https://www.youtube.com/oembed?url=' +
        encodeURIComponent('https://www.youtube.com/watch?v=' + ytId) + '&format=json');
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) return 'offline';          // 401/403: exists, can't be embedded here
      var d = await r.json();
      return (d && d.title) ? { name: d.title, artist: d.author_name || '' } : null;
    } catch(e){ return 'offline'; }
  },

  /** a short follow-up to paste back, naming exactly what failed */
  /**
   * A follow-up naming exactly what riffrolled could not use.
   *
   * Three failures, not one. A dead link, a link to somewhere that is
   * not YouTube, and the same video id handed back for several different
   * songs all end with the track missing from the playlist, and all three
   * are things the AI can put right if it is told which happened.
   */
  buildFixPrompt(dead, rep){
    var L = [];
    var noLink = (rep && rep.noLink) || [];
    var repeated = (rep && rep.repeated) || [];

    L.push('riffrolled plays YouTube videos and nothing else, so some of that set could');
    L.push('not be imported. Here is exactly what went wrong.');
    L.push('');

    if (noLink.length){
      L.push(noLink.length + ' track(s) had a link that was not a YouTube video (Bandcamp,');
      L.push('Spotify, SoundCloud, an album page):');
      noLink.forEach(function(it, i){
        L.push('  ' + (i + 1) + '. ' + (it.artist ? it.artist + ' — ' : '') + it.title);
      });
      L.push('');
    }

    if (repeated.length){
      L.push(repeated.length + ' track(s) reused a video id already used for a different song,');
      L.push('which means the link is wrong for at least one of them:');
      repeated.forEach(function(it, i){
        L.push('  ' + (i + 1) + '. ' + (it.artist ? it.artist + ' — ' : '') + it.title
          + '  (same video as ' + it.repeatOf + ')');
      });
      L.push('');
    }

    if (!dead.length) return L.concat([
      'Please send those tracks again, in the same pipe format, with ONE change:',
      '',
      '  - Give a real YouTube watch URL you have actually seen, or',
      '  - leave the link cell EMPTY. An empty cell is the correct answer and',
      '    riffrolled will find the track from the artist and title.',
      '',
      'Never reuse a video id, and never write one from memory. Ids are random',
      'strings — one that looks plausible is almost always wrong, and a wrong',
      'link is worse than no link.',
    ]).join('\n');

    L.push('Those YouTube links do not exist. I checked every one of them against YouTube.');
    L.push('');
    L.push('These tracks need fixing:');
    dead.forEach(function(it, i){
      L.push('  ' + (i + 1) + '. ' + (it.artist ? it.artist + ' — ' : '') + it.title);
    });
    L.push('');
    L.push('Please send those tracks again, in the same pipe format, with ONE change:');
    L.push('');
    L.push('  - If you can search the web, search YouTube and copy the exact watch URL you see.');
    L.push('  - If you cannot search, leave the link cell EMPTY. An empty cell is the correct');
    L.push('    answer and riffrolled will find the track from the artist and title.');
    L.push('');
    L.push('Do not write a video id from memory. Ids are random strings — one that looks');
    L.push('plausible is almost always wrong, and a wrong link is worse than no link.');
    return L.join('\n');
  },

  /** total runtime of what was parsed, in seconds (0 where unknown) */
  totalSecs(items){
    return (items || []).reduce(function(n, it){ return n + (it.secs || 0); }, 0);
  },

  fmtSecs(secs){
    secs = Math.round(secs || 0);
    if (!secs) return '—';
    var h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
    return h ? (h + 'h ' + m + 'm') : (m + ' min');
  },

  /* ── import ──────────────────────────────────────────────────────────
     What comes back is the playlist. It lands in the Playlist panel as an
     ordinary riffrolled playlist — the DJ AI menu never shows tracks —
     and everything the AI told us (genre, running time, why) is kept:
     locally on the track, and in the shared catalogue so riffrolled's own
     database grows with every set anyone builds.

     Nothing is looked up. The AI was asked to verify its links; a dead id
     fails on the deck, which the player already handles. ── */
  /**
   * Why a reply of N tracks became a playlist of fewer.
   *
   * riffrolled already knew all of this and said none of it: fifteen
   * tracks went in, four came out, and the only clue was the number. The
   * three reasons are completely different problems — one is the AI
   * ignoring the brief, one is the AI inventing links, one is a dead
   * video — and they need different responses from the listener.
   */
  importReport(items){
    var r = { total: items.length, noLink: [], dead: [], repeated: [], playable: 0 };
    var usedBy = {};
    items.forEach(function(it){
      if (it.dead){ r.dead.push(it); return; }
      if (!it.url){ r.noLink.push(it); return; }
      if (usedBy[it.url]){
        // the same video id handed back for a different song: the AI
        // filled a row it could not find a real link for
        it.repeatOf = usedBy[it.url];
        r.repeated.push(it);
        return;
      }
      usedBy[it.url] = (it.artist ? it.artist + ' — ' : '') + it.title;
      r.playable++;
    });
    return r;
  },

  /**
   * Find YouTube links for tracks the AI left without one.
   *
   * `/api/resolve` has existed and been tested since before any of this,
   * and nothing ever called it. That made "leave the url cell empty" a
   * lie: an empty cell was dropped exactly as silently as a Bandcamp
   * link, so the brief was inviting the AI into a different quiet
   * failure. Telling an AI an empty cell is fine is only honest if
   * riffrolled then goes and finds the track.
   *
   * Cheap first: the shared catalogue costs nothing, and only what is
   * left over reaches a YouTube search, which is quota'd and capped
   * server-side. Best-effort throughout — a track that cannot be
   * resolved is reported, never invented.
   */
  async resolveMissing(items, onProgress){
    var need = items.filter(function(it){ return !it.url && (it.title || it.artist); });
    if (!need.length) return { asked: 0, found: 0 };
    (onProgress || function(){})(need.length);

    try {
      var r = await fetch('/api/resolve', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          allowYouTube: true,
          items: need.slice(0, 30).map(function(it){
            return { artist: it.artist || '', title: it.title || '' };
          })
        })
      });
      if (!r.ok) return { asked: need.length, found: 0 };
      var d = await r.json();
      var found = 0;
      (d.results || []).forEach(function(res){
        if (!res || !res.ok || !res.url) return;
        var it = need[res.i];
        if (!it || it.url) return;
        var id = self_ytId(res.url);
        if (!id) return;
        it.url = id;
        /* Clear the dead flag too. A track whose invented link we just
           replaced with a real one is not dead any more, and leaving the
           flag set would have it reported as dead and then dropped by
           importPlaylist — found and discarded in the same breath. */
        it.dead = false;
        it.resolvedVia = res.via || 'resolve';
        if (res.name && !it.title) it.title = res.name;
        found++;
      });
      return { asked: need.length, found: found, left: d.lookups_left };
    } catch (e) {
      return { asked: need.length, found: 0, offline: true };
    }

    function self_ytId(u){
      var m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(String(u || ''));
      return m ? m[1] : null;
    }
  },

  async importPlaylist(parsed, rawReply){
    /* A link checked and found missing is not playable, and a video id
       already used by an earlier track in the same reply is not a second
       track — importing it would add a row that plays a song already in
       the set under somebody else's name. */
    var seenUrl = {};
    var playable = parsed.items.filter(function(it){
      if (!it.url || it.dead) return false;
      if (seenUrl[it.url]) return false;
      seenUrl[it.url] = 1;
      return true;
    });
    if (!playable.length) return null;

    var base = parsed.name || this.briefSummaryName();
    var pls = await dbBoss.getPlaylists();
    var name = '🤖 ' + base, n = 2;
    while (pls.some(function(p){ return p.name === name; })) name = '🤖 ' + base + ' ' + (n++);

    var plId = await dbBoss.createPl(name);
    var total = this.totalSecs(playable);
    await db.playlists.update(plId, {
      source: 'ai',
      aiRequest: this.briefLine(),
      aiBrief: this.briefObject(),
      totalSecs: total,
      aiAt: Date.now()
    });

    for (var i = 0; i < playable.length; i++){
      var it = playable[i];
      // the AI's clean artist and title are what get stored and shown;
      // YouTube's video title is kept beside them, not instead of them
      var title = it.title || it.ytTitle || it.url;
      var artist = it.artist || it.ytChannel || '';
      var tid = await dbBoss.createTrack(it.url, title);
      var meta = {};
      try {
        var row = await dbBoss.getTrack(it.url);
        if (row){
          if (!row.artist && artist) meta.artist = artist;
          if (it.secs) meta.durSec = it.secs;
          if (it.ytTitle && !row.ytTitle) meta.ytTitle = it.ytTitle;   // what the video calls itself
          if (it.genre){
            meta.genre = it.genre;
            // the AI's genre becomes a tag too, so Random Mix and search see it
            var tags = (row.tags || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
            if (tags.indexOf(it.genre.toLowerCase()) === -1) tags.push(it.genre.toLowerCase());
            meta.tags = tags.join(', ');
          }
          if (Object.keys(meta).length) await dbBoss.updateTrackMeta(it.url, meta);
        }
      } catch(e){ /* meta is best effort */ }
      await dbBoss.addToPlaylist(plId, tid);
    }

    // riffrolled's own database: the tracks, then the set as name + ids
    this.publish(name, playable);

    try {
      await db.aiSessions.add({
        ts: Date.now(),
        playlistId: plId,
        playlistName: name,
        request: this.briefLine(),
        brief: this.briefObject(),
        mode: this.state.mode,
        asked: this.state.count,
        resolvedCount: playable.length,
        totalSecs: total,
        items: parsed.items.map(function(it){
          return { artist:it.artist, title:it.title, ytId:it.url || '', secs:it.secs || 0,
                   genre:it.genre || '', why:it.why || '',
                   // what the links turned out to be, so the history shows
                   // which AI actually looked things up and which invented them
                   dead: !!it.dead, realName: it.realName || '' };
        }),
        reply: String(rawReply || '').slice(0, 20000)
      });
    } catch(e){ /* the playlist is what matters */ }

    return {
      playlistId: plId, name: name, count: playable.length,
      skipped: parsed.items.length - playable.length,
      report: this.importReport(parsed.items),
      totalSecs: total
    };
  },

  /** a name from the brief when the AI didn't give one */
  briefSummaryName(){
    var bits = [];
    ['activity', 'feel', 'direction'].forEach(function(k){
      var o = djAi.picked(k);
      if (o) bits.push(o.label);
    });
    return bits.length ? bits.join(' · ') : 'DJ AI set';
  },

  briefObject(){
    var self = this, picks = {};
    this.cats.forEach(function(c){
      if (!c.enabled) return;
      var o = self.picked(c.key);
      if (o) picks[c.key] = o.label;
    });
    return {
      picks: picks, familiarity: this.state.familiarity, chaos: this.state.chaos,
      count: this.state.count, minutes: this.state.minutes, maxTrackMin: this.state.maxTrackMin,
      sharedContext: this.state.shareContext
    };
  },

  /** send the set to riffrolled's own database: tracks, then name + ids.
      Anonymous — no wallet, no device id. Fire and forget: offline is fine. */
  publish(name, items){
    try {
      fetch('/api/playlist/save', {
        method: 'POST', headers: { 'content-type':'application/json' },
        body: JSON.stringify({
          name: name,
          source: 'ai',
          tracks: items.map(function(it){
            return {
              name: it.title || '', artist: it.artist || '', genre: it.genre || '',
              url: 'https://www.youtube.com/watch?v=' + it.url,
              duration: it.secs || 0
            };
          })
        })
      }).catch(function(){});
    } catch(e){ /* offline: the local playlist is the one that matters */ }
  },

  /* ── history (local only) ── */
  async history(limit){
    try { return await db.aiSessions.orderBy('ts').reverse().limit(limit || 20).toArray(); }
    catch(e){ return []; }
  },

  async forget(sessionId){
    try { await db.aiSessions.delete(sessionId); } catch(e){}
  }
};
