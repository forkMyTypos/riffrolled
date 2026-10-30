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
    /* Auto: riffrolled's own AI makes the mix (POST /api/automix). Pick a
       style, press one button — nothing to copy, no other AI needed. */
    { id:'auto',  label:'AUTO',        sub:'WE MAKE IT', state:'ACTIVE',
      blurb:'Say what kind of music — riffrolled makes the mix for you, right here.' },
    { id:'text',  label:'TEXT',        sub:'COPY + PASTE', state:'ACTIVE',
      blurb:'Build the brief, copy it, paste your AI\'s answer back.' },
    /* Track Rolled Journey: the listener's own tracks are the brief. Same
       copy + paste system as TEXT; only the brief is different. */
    { id:'seeded', label:'TRACK ROLLED', sub:'JOURNEY', state:'ACTIVE',
      blurb:'Pick a few tracks you love — the DJ rolls a journey outward from them.' },
    /* hidden until they exist: { byoai: YOUR AI · BRING YOUR OWN },
       { riffroll: RIFFROLL IT · WE HANDLE IT } */
  ],

  /* ── brief state. Picks are keyed by category key; everything here is
     persisted to settings so the menu looks the same tomorrow. ── */
  state: {
    mode: 'auto',         // new visitors start with the one-button way
    textMode: 'simple',   // 'simple' | 'speed' | 'details' — the three ways to brief
    simpleStyles: [],     // Simple mode: up to three kinds of music, as named
    picks: {},            // { activity: optionId, feel: optionId, … }
    familiarity: 30,      // % familiar; the rest is discovery
    chaos: false,
    count: 15,
    minutes: 60,
    maxTrackMin: 8,
    shareContext: true,
    likedN: 15,           // how many most-liked tracks go with "Share your track data": 10 | 15 | 20
    stick: true,          // Where should we go: stay in that genre (true) or wander from it
    allowPromoted: false, // opt-in: paid placements offered alongside the brief
    shareCommunity: false,// opt-in: post imported sets to Mixes → Community
    seeds: [],            // Track Rolled Journey: [{ ytId, artist, title }], up to SEED_MAX
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
    if (!Array.isArray(this.state.seeds)) this.state.seeds = [];
    if (['auto', 'text', 'seeded'].indexOf(this.state.mode) < 0) this.state.mode = 'auto';
    if (['simple', 'speed', 'details'].indexOf(this.state.textMode) < 0) this.state.textMode = 'simple';
    if (!Array.isArray(this.state.simpleStyles)) this.state.simpleStyles = [];
    // anything picked that has since been deleted quietly clears
    var self = this;
    Object.keys(this.state.picks).forEach(function(k){
      var o = self.optionById(self.state.picks[k]);
      if (!o || o.retired) delete self.state.picks[k];
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
        var have = {}, inList = {};
        had.forEach(function(o){ have[o.label] = o; });
        for (var j = 0; j < c.options.length; j++){
          var o = c.options[j];
          inList[o.label] = true;
          var row = have[o.label];
          if (!row){
            // the listener typed this one before it was built in ("trance"): adopt theirs, keep their stars
            var low = o.label.toLowerCase();
            row = had.find(function(x){ return !x.builtin && String(x.label).toLowerCase() === low; });
            if (row){
              await db.djOptions.update(row.id, { builtin: true, label: o.label, tags: o.tags || [], line: o.line || '',
                vibe: o.vibe || [], blurb: o.blurb || '' });
              continue;
            }
          }
          if (row){
            /* A built-in the listener already has: keep their favourite,
               use count and hidden choice, but take the current wording —
               the vocabulary is refined over time (vibe words, one-liners,
               the sentence handed to the AI). A retired built-in that is
               back in the list comes back. */
            if (row.builtin && !row.any){
              var upd = { tags: o.tags || [], line: o.line || '', vibe: o.vibe || [], blurb: o.blurb || '' };
              if (row.retired){ upd.retired = false; upd.hidden = false; }
              await db.djOptions.update(row.id, upd);
            }
            continue;
          }
          await db.djOptions.add({
            categoryId: catId, label: o.label, tags: o.tags || [],
            line: o.line || '', vibe: o.vibe || [], blurb: o.blurb || '', builtin: true, hidden: false,
            favourite: 0, useCount: 0, lastTs: 0
          });
        }
        /* Built-ins that left the list ("Fucking about" became "Messing
           about") are retired: hidden, not deleted, so a favourite or a
           saved brief that names one still reads. The listener's own
           options are never touched. */
        for (var k = 0; k < had.length; k++){
          var h = had[k];
          if (h.builtin && !h.any && !inList[h.label] && !h.retired){
            await db.djOptions.update(h.id, { hidden: true, retired: true });
          }
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
    if (this.state.mode === 'auto' || (this.state.mode !== 'seeded' && this.state.textMode === 'simple')){
      var st = this.state.simpleStyles || [];
      return (st.length ? st.join(' + ') : 'Any music') + ' | ' + this.state.count + ' tracks · ' + this.state.minutes + ' min';
    }
    if (this.state.mode === 'seeded'){
      var seeds = this.state.seeds.map(function(t){ return (t.artist ? t.artist + ' — ' : '') + (t.title || t.ytId); });
      bits.push('From: ' + (seeds.length ? seeds.join(', ') : 'no seeds yet'));
      var pp = this.picked('personality');
      if (pp) bits.push(pp.label);
      bits.push(this.state.count + ' tracks · ' + this.state.minutes + ' min');
      if (this.state.chaos) bits.push('CHAOS');
      return bits.join(' | ');
    }
    this.cats.forEach(function(c){
      if (!c.enabled) return;
      var o = self.picked(c.key);
      if (o) bits.push(o.label);
    });
    bits.push(this.state.familiarity + '% familiar / ' + (100 - this.state.familiarity) + '% discovery');
    bits.push(this.state.count + ' tracks · ' + this.state.minutes + ' min');
    if (this.state.chaos) bits.push('CHAOS');
    return bits.join(' | ');
  },

  /* ── what the DJ is allowed to know about the listener ──
     Only their 10 / 15 / 20 most-liked tracks (they choose), listed in
     full in the menu before it goes anywhere, and switched off with one
     toggle. Nothing is sent by riffrolled: the listener pastes it. ── */
  async context(){
    // what "Share your track data" hands the DJ: the most-liked tracks only
    var liked = await this.likedTracks(this.likedN());
    return { liked: liked, size: liked.length };
  },

  /* ── the prompt ──────────────────────────────────────────────────────
     One-shot (internally still "speed") asks for the finished playlist in
     one go. Multi-shot (internally "details") asks for a DJ draft first;
     Link Hunter, built from that draft, is the second prompt. Same
     brief underneath. ── */
  async buildPrompt(){
    if (this.state.mode === 'seeded') return await this.buildSeededPrompt();
    if (this.state.textMode === 'simple') return await this.buildSimplePrompt();
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
        method: 'POST', headers: window.riffWallet ? await riffWallet.peekHeaders({ 'content-type': 'application/json' }) : { 'content-type': 'application/json' },
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
        method: 'POST', headers: window.riffWallet ? await riffWallet.peekHeaders({ 'content-type': 'application/json' }) : { 'content-type': 'application/json' },
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

  /* ── THE BRIEF, as labelled lines ──────────────────────────────────────
     What each category is saying: the pick, or the category's "don't mind"
     sentence when nothing is picked. Categories that are switched off say
     nothing at all. A pick that means "you choose" (Any era, Don't care) is
     reported as such rather than as a preference. */
  _say(key){
    var c = this.cat(key);
    if (!c || !c.enabled) return null;
    var o = this.effective(key);
    if (!o) return { label:'', text:'', any:true };
    var any = !!o.any || /^(any era|don[’']t care|don[’']t mind|nothing special)$/i.test(o.label);
    return { label:o.label, line:o.line || '', any:any, text: any ? (o.line || o.label) : o.label,
             vibe: (o.vibe && o.vibe.length) ? o.vibe.join(' · ') : '' };
  },

  /** What the brief says about "Where should we go?": stay in it, or wander. */
  _dirNote(v){
    if (v && !v.any && this.state.stick !== false)
      return 'Stay in it: most tracks should clearly be ' + v.label + '. A few close neighbours are fine, but this is the listener\'s chosen genre, not a loose suggestion.';
    return 'A starting coordinate, not a genre filter. You are allowed to wander.';
  },

  _chaosLine(){
    return DJ_CHAOS_LINES[Math.floor(Math.random() * DJ_CHAOS_LINES.length)];
  },

  _genreList(){
    return (window.riffGenres && riffGenres.LIST) ? riffGenres.LIST.join(', ') : '';
  },

  /* ONE-SHOT. The whole job in one prompt: curate, find the links, verify,
     repair, reply with a finished RIFFROLLED-PLAYLIST. The wording lives in
     DJ_ONESHOT_PROMPT (dj-data.js); this fills THE BRIEF. */
  async buildSpeedPrompt(){
    var self = this, s = this.state, L = [];
    L.push('In short: ' + this.briefLine());
    L.push('');
    var line = function(label, key, extra){
      var v = self._say(key);
      if (!v) return;
      L.push(label + ': ' + (v.text || 'your choice') + (!v.any && v.vibe ? ' (' + v.vibe + ')' : '') + (extra && !v.any ? extra : ''));
    };
    line('What are you doing', 'activity');
    line('How it should feel', 'feel');
    var dv = this._say('direction');
    line('Where to go', 'direction', dv && !dv.any && s.stick !== false
      ? ' (stay in it: most tracks should clearly be ' + dv.label + '; a few close neighbours are fine)'
      : ' (a starting coordinate, not a genre fence)');
    var d = this._say('discovery');
    if (d) L.push('Discovery: ' + (d.label || "Don't care") + (d.line && !d.any ? ' — ' + d.line : ''));
    var p = this._say('personality');
    if (p) L.push('DJ personality: ' + (p.any ? p.text : p.label + (p.line ? ' — ' + p.line : '')));
    // energy, era, speed and anything the listener added: only when switched on and actually chosen
    this.cats.forEach(function(c){
      if (['activity', 'feel', 'direction', 'discovery', 'personality'].indexOf(c.key) >= 0) return;
      var v = self._say(c.key);
      if (v && self.picked(c.key) && !v.any) L.push(c.label.replace(/\?$/, '') + ': ' + v.label + (v.line ? ' — ' + v.line : ''));
    });
    if (s.chaos) L.push('Chaos: ON — ' + this._chaosLine());
    L.push('Familiarity: ' + s.familiarity + '% familiar / ' + (100 - s.familiarity) + '% discovery');
    L.push('Tracks: exactly ' + s.count);
    L.push('Total duration: about ' + s.minutes + ' minutes');
    L.push('Longest single track: ' + s.maxTrackMin + ' minutes');
    var g = this._genreList();
    if (g) L.push('Allowed genres for the GENRE line: ' + g);

    // the listener's most-liked tracks, and nothing else about them
    var lb = await this.listeningBlock();
    if (lb){ L.push(''); L.push(lb); }
    var promoted = await this.promotedBlock();
    if (promoted){ L.push(''); L.push(promoted.trim()); }

    return DJ_ONESHOT_PROMPT
      .replace('{{brief}}', L.join('\n'))
      .replace(/\{\{count\}\}/g, String(s.count));
  },

  /* SIMPLE. One question — what kind of music — and the one-shot prompt
     (DJ_ONESHOT_PROMPT) around it, so the reply comes back the same way. */
  async buildSimplePrompt(){
    var s = this.state, L = [];
    var st = (s.simpleStyles || []).slice(0, 3);
    L.push('In short: ' + this.briefLine());
    L.push('');
    if (st.length){
      L.push('Music: ' + st.join(', ') + ' (stay in it: most tracks should clearly be ' + (st.length > 1 ? 'one of these' : 'this') +
             '; a few close neighbours are fine — this is the listener\'s own choice)');
      var gs = [];
      st.forEach(function(x){ var g = window.musicStyles ? musicStyles.genreOf(x) : ''; if (g && gs.indexOf(g) < 0) gs.push(g); });
      if (gs.length) L.push('For the GENRE line, these count as: ' + gs.join(', '));
    } else {
      L.push('Music: your choice — make it good');
    }
    L.push('Tracks: exactly ' + s.count);
    L.push('Total duration: about ' + s.minutes + ' minutes');
    L.push('Longest single track: ' + s.maxTrackMin + ' minutes');
    var g = this._genreList();
    if (g) L.push('Allowed genres for the GENRE line: ' + g);
    var lb = await this.listeningBlock();
    if (lb){ L.push(''); L.push(lb); }
    var promoted = await this.promotedBlock();
    if (promoted){ L.push(''); L.push(promoted.trim()); }
    return DJ_ONESHOT_PROMPT
      .replace('{{brief}}', L.join('\n'))
      .replace(/\{\{count\}\}/g, String(s.count));
  },

  /** Simple mode: add / remove a kind of music (up to three) */
  async addSimpleStyle(name){
    name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name) return false;
    var st = this.state.simpleStyles = this.state.simpleStyles || [];
    if (st.some(function(x){ return x.toLowerCase() === name.toLowerCase(); })) return false;
    if (st.length >= 3) throw new Error('Up to three kinds of music — remove one first');
    st.push(name);
    await this.save();
    return true;
  },
  async removeSimpleStyle(i){
    (this.state.simpleStyles || []).splice(i, 1);
    await this.save();
  },

  /** The listener's most-liked tracks, "Artist - Title", most likes first
      (a tie goes to the one liked most recently). This is all the DJ is
      told about the listener's taste: no plays, history, tags or library. */
  async likedTracks(n){
    try {
      var likes = {}, last = {};
      (await db.reactions.where('kind').equals('like').toArray()).forEach(function(r){
        likes[r.ytId] = (likes[r.ytId] || 0) + 1;
        last[r.ytId] = Math.max(last[r.ytId] || 0, r.ts || 0);
      });
      var ids = Object.keys(likes).sort(function(a, b){ return (likes[b] - likes[a]) || (last[b] - last[a]); });
      var out = [];
      for (var i = 0; i < ids.length && out.length < (n || 15); i++){
        var t = await db.tracks.where('ytId').equals(ids[i]).first();
        if (t && t.playable !== 0) out.push((t.artist ? t.artist + ' - ' : '') + (t.name || t.ytId));
      }
      return out;
    } catch(e){ return []; }
  },

  /** how many liked tracks go with "Share your track data" */
  likedN(){ var n = Number(this.state.likedN); return [10, 15, 20].indexOf(n) >= 0 ? n : 15; },

  /** the listening block: the N most-liked, or '' with none */
  async listeningBlock(){
    if (!this.state.shareContext) return '';
    var liked = await this.likedTracks(this.likedN());
    if (!liked.length) return '';
    return DJ_SPEED_LISTENING
      .replace('{{n}}', String(liked.length))
      .replace('{{liked_tracks}}', liked.map(function(t, i){ return (i + 1) + '. ' + t; }).join('\n')).trim();
  },

  /* MULTI-SHOT, prompt 1: the DJ brief (DJ_MULTI_PROMPT). The AI only
     curates here and replies with a RIFFROLLED-DJ-DRAFT — no links, a
     reason for every track. Pasting that draft back builds prompt 2, Link
     Hunter (buildLinkHunter). Same wording as the admin tool's
     dj_brief_prompt.txt; same brief sections as its djbrief.py. */
  DEFAULT_IDENTITY: ['Where Did This Come From?', 'You are Where Did This Come From?: every track makes the listener ask exactly that.'],

  _identity(){
    var p = this._say('personality');
    if (!p || p.any || !p.label) return this.DEFAULT_IDENTITY;
    return [p.label, p.line || ('You are ' + p.label + '.')];
  },

  async buildDetailsPrompt(){
    var self = this, s = this.state, B = [];
    var sec = function(title, lines){
      lines = lines.filter(Boolean);
      if (lines.length) B.push(title + '\n' + lines.join('\n') + '\n');
    };
    var say = function(key){ var v = self._say(key); return v ? (v.any ? v.text : (v.line || v.label)) : ''; };
    var dir = this._say('direction');
    var withVibe = function(key){
      var v = self._say(key);
      if (!v) return '';
      return v.any ? v.text : (v.line && v.line !== v.label ? v.line : v.label) + (v.vibe ? ' — ' + v.vibe : '');
    };
    sec('WHAT ARE YOU DOING?', [withVibe('activity')]);
    sec('HOW DO YOU WANT IT TO FEEL?', [withVibe('feel')]);
    sec('WHERE SHOULD WE GO?', [dir ? withVibe('direction') : '', this._dirNote(dir)]);
    var d = this._say('discovery');
    sec('DISCOVERY', [d && !d.any ? (d.line || d.label) : 'No particular discovery brief — just make it good.',
      'Do not turn this into an obscure-music exercise. A great song from a known artist is welcome when it improves the journey.']);
    var id = this._identity();
    sec('DJ PERSONALITY', [id[0], id[1]]);
    sec('FAMILIARITY', ['Approximately ' + s.familiarity + '% familiar territory, ' + (100 - s.familiarity) +
      '% discovery. This is a creative direction, not a quota. Familiarity should make the surprises hit harder.']);
    this.cats.forEach(function(c){
      if (['activity', 'feel', 'direction', 'discovery', 'personality'].indexOf(c.key) >= 0) return;
      var v = self._say(c.key);
      if (v && self.picked(c.key) && !v.any) sec(c.label.replace(/\?$/, '').toUpperCase(), [v.line || v.label]);
    });
    if (s.chaos) sec('CHAOS', [this._chaosLine()]);

    var lb = await this.listeningBlock();
    if (lb) B.push(lb + '\n');
    var promoted = await this.promotedBlock();
    if (promoted) B.push(promoted.trim() + '\n');

    sec('THE CHALLENGE', ['Build a ' + s.count + '-track, roughly ' + s.minutes + '-minute journey. Every track must earn its place. ' +
      'Every transition must contribute to the experience.', 'No track longer than ' + s.maxTrackMin + ' minutes.']);

    var m = s.minutes, spread = Math.max(3, Math.round(m * 0.08)), lines = [];
    for (var i = 1; i <= s.count; i++) lines.push(i + ' | Artist | Exact track title | Duration or UNKNOWN | Genre | Why this track belongs here');
    return DJ_MULTI_PROMPT
      .replace('{{identity}}', id[0].toUpperCase() + '\n' + id[1])
      .replace(/\{\{count\}\}/g, String(s.count))
      .replace('{{runtime_lo}}', String(Math.max(1, m - spread)))
      .replace('{{runtime_hi}}', String(m + spread))
      .replace('{{max_track}}', String(s.maxTrackMin))
      .replace('{{lines}}', lines.join('\n'))
      .replace('{{brief}}', B.join('\n').trim() + '\n');
  },

  /* ── MULTI-SHOT, step 2: Link Hunter ──────────────────────────────
     A RIFFROLLED-DJ-DRAFT has artists, titles, durations, genres and a
     reason per track, but no links. It is not a playlist yet, so pasting
     one does not import anything: it is read, and turned into prompt 2. */
  isDraft(text){
    var t = String(text || '');
    return /RIFFROLLED[-\s]DJ[-\s]DRAFT/i.test(t) && !/RIFFROLLED[-\s]PLAYLIST/i.test(t);
  },

  readDraft(text){
    var self = this, out = { name:'', mood:'', tracks:[] };
    String(text || '').replace(/​|﻿/g, '').split(/\r?\n/).forEach(function(raw){
      var l = raw.trim().replace(/^`+|`+$/g, '');
      if (!l) return;
      var m = /^\W{0,3}(\d{1,3})\s*[.)]?\s*\|\s*(.+)$/.exec(l);
      if (m){
        var c = m[2].split('|').map(function(x){ return x.trim().replace(/^[*_`\s]+|[*_`\s]+$/g, ''); })
          .filter(function(x){ return !/https?:\/\/|youtu\.?be/i.test(x); });
        if (c.length < 2 || !(c[0] || c[1])) return;
        while (c.length < 5) c.push('');
        out.tracks.push({ n: out.tracks.length + 1, artist: c[0].slice(0, 200), title: c[1].slice(0, 300),
          duration: (c[2] || 'UNKNOWN').slice(0, 20), genre: c[3].slice(0, 100),
          why: c.slice(4).filter(Boolean).join(' | ').slice(0, 300) });
        return;
      }
      var h = /^\W*(NAME|TITLE|MOOD|ABOUT)\W*?\s*[:：]\s*(.*)$/i.exec(l);
      if (h && !out.tracks.length){
        var v = self._clean(h[2]);
        if (/^(name|title)$/i.test(h[1])) out.name = v.slice(0, 80); else out.mood = v.slice(0, 400);
      }
    });
    return out;
  },

  /* ── TRACK ROLLED JOURNEY ──────────────────────────────────────────────
     Seed tracks instead of a brief: the DJ rolls a journey outward from
     them (DJ_SEEDED_PROMPT). Up to five seeds; the DJ personality and the
     length come from the same controls as everywhere else. */
  SEED_MAX: 5,

  seedKey(t){ return t.ytId || this._matchNorm((t.artist || '') + ' ' + (t.title || '')); },

  async addSeed(t){
    t = { ytId: t.ytId || '', artist: String(t.artist || '').slice(0, 200), title: String(t.title || '').slice(0, 300) };
    if (!t.ytId && !t.title) throw new Error('Give a track: a YouTube link, or Artist - Title');
    var self = this, k = this.seedKey(t);
    if (this.state.seeds.some(function(x){ return self.seedKey(x) === k; })) throw new Error('That track is already a seed');
    if (this.state.seeds.length >= this.SEED_MAX) throw new Error('Five seeds at most — remove one first');
    this.state.seeds.push(t);
    await this.save();
    return t;
  },

  async removeSeed(i){
    this.state.seeds.splice(i, 1);
    await this.save();
  },

  /** a typed seed: a YouTube link or bare id (looked up in the library), or "Artist - Title" */
  async seedFromText(text){
    var s = String(text || '').trim();
    if (!s) throw new Error('Type a track, or paste a YouTube link');
    var id = this._ytUrlId(s) || this._bareId(s);
    if (id){
      var row = null;
      try { row = await db.tracks.where('ytId').equals(id).first(); } catch(e){}
      return { ytId: id, artist: row ? (row.artist || '') : '', title: row ? (row.name || '') : '' };
    }
    var d = this._splitDash(s);
    return d ? { ytId: '', artist: d.artist, title: d.title } : { ytId: '', artist: '', title: s.slice(0, 300) };
  },

  _seedLine(t, i){
    return (i + 1) + '. ' + (t.artist ? t.artist + ' — ' : '') + (t.title || '(title unknown)') +
      (t.ytId ? '  (YouTube video ID: ' + t.ytId + ')' : '');
  },

  async buildSeededPrompt(){
    var self = this, s = this.state, L = [];
    if (!s.seeds.length) throw new Error('Add at least one seed track first');
    L.push('In short: ' + this.briefLine());
    L.push('');
    L.push('THE SEED TRACKS (the starting point — do not include these in the mix):');
    s.seeds.forEach(function(t, i){ L.push(self._seedLine(t, i)); });
    L.push('');
    var p = this._say('personality');
    if (p) L.push('DJ personality: ' + (p.any ? p.text : p.label + (p.line ? ' — ' + p.line : '')));
    if (s.chaos) L.push('Chaos: ON — ' + this._chaosLine());
    L.push('Tracks: exactly ' + s.count);
    L.push('Total duration: about ' + s.minutes + ' minutes');
    L.push('Longest single track: ' + s.maxTrackMin + ' minutes');
    var g = this._genreList();
    if (g) L.push('Allowed genres for the GENRE line: ' + g);
    var lb = await this.listeningBlock();
    if (lb){ L.push(''); L.push(lb); }
    var promoted = await this.promotedBlock();
    if (promoted){ L.push(''); L.push(promoted.trim()); }
    return DJ_SEEDED_PROMPT.replace('{{brief}}', L.join('\n')).replace(/\{\{count\}\}/g, String(s.count));
  },

  /* ── SHARE WITH COMMUNITY ──────────────────────────────────────────────
     Opt-in (the "🌍 Share with community" box, off by default). An
     imported set goes to Mixes → Community exactly as the Share button
     would send it: name, one line about it, genre, the tracks' titles,
     artists and YouTube links, and the DJ choices. The wallet's private key
     rides in the X-Riff-Key header so the server can log the sharer's
     PUBLIC key (admin-only, for tracing abuse); nothing else about the
     listener goes. Every rule the Share button lives under applies: the
     daily limit, link checks, name rules, duplicate sets, reports. */
  async shareToCommunity(playlistId, meta){
    meta = meta || {};
    var pl = await db.playlists.get(playlistId);
    if (!pl) throw new Error('That playlist is gone');
    var joins = await db.playlistTracks.where('playlistId').equals(playlistId).sortBy('order');
    var tracks = [];
    for (var i = 0; i < joins.length && tracks.length < 50; i++){
      var t = await db.tracks.get(joins[i].trackId);
      if (t && t.ytId && t.playable !== 0){
        tracks.push({ name: t.name || '', artist: t.artist || '', genre: t.genre || '', url: 'https://www.youtube.com/watch?v=' + t.ytId });
      }
    }
    var name = String(meta.name || pl.name || '').replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 80);
    var genre = meta.genre && window.riffGenres ? (riffGenres.normalize(meta.genre).genre || '') : '';
    if (!genre){
      var gs = tracks.map(function(t){ return t.genre; }).filter(Boolean);
      genre = gs[0] || '';
    }
    var brief = (window.mixesBoss && mixesBoss.shareableBrief) ? mixesBoss.shareableBrief(this.briefObject()) : null;
    var headers = Object.assign({ 'content-type': 'application/json' },
      window.riffWallet ? await riffWallet.headers() : {});
    var r = await fetch('/api/mixes/share', { method: 'POST', headers: headers,
      body: JSON.stringify({ name: name, blurb: String(meta.about || pl.aiAbout || '').slice(0, 200), genre: genre,
                             brief: brief || undefined, tracks: tracks }) });
    var j = null; try { j = await r.json(); } catch(e){}
    if (!r.ok) throw new Error((j && j.error) || ('Sharing didn’t work (HTTP ' + r.status + ')'));
    try { await db.playlists.update(playlistId, { sharedMixId: j.id }); } catch(e){}
    return j;
  },

  /* ── LINK HUNTER ───────────────────────────────────────────────────────
     The prompt that finds the YouTube links (DJ_LINK_HUNTER_PROMPT). Used
     for multi-shot step 3, and for any reply — one-shot or multi-shot —
     that came back without a link for every track: it is then built for
     just the tracks that are missing, so the AI isn't asked twice. */
  _mss(secs){
    secs = Math.round(secs || 0);
    return secs ? Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0') : 'UNKNOWN';
  },

  /** tracks → the Link Hunter prompt, every link UNCHECKED */
  buildLinkHunterFor(tracks, name){
    var self = this;
    var L = ['RIFFROLLED-PLAYLIST', 'NAME: ' + (name || 'Untitled mix')];
    tracks.forEach(function(t, i){
      var dur = t.duration || self._mss(t.secs);
      L.push(((i + 1) + ' | ' + (t.artist || '') + ' | ' + (t.title || '') + ' | UNCHECKED | ' + dur + ' | ' +
              (t.genre || '') + ' | ' + (t.why || '')).replace(/[\s|]+$/, ''));
    });
    L.push('END');
    return DJ_LINK_HUNTER_PROMPT.replace('{{playlist}}', L.join('\n'));
  },

  /** a DJ draft (or any track list without links) → { prompt, draft:{name, tracks} }, or null */
  buildLinkHunter(text){
    var d = this.readDraft(text);
    if (!d.tracks.length){
      // not a draft: any list of tracks will do — a one-shot reply from an AI that couldn't search
      var p = this.parseReply(text);
      if (!p.items.length) return null;
      d = { name: p.name, mood: p.about || '', tracks: p.items.map(function(it, i){
        return { n: i + 1, artist: it.artist, title: it.title, secs: it.secs, genre: it.genre, why: it.why };
      }) };
    }
    return { prompt: this.buildLinkHunterFor(d.tracks, d.name), draft: d };
  },
  buildTrackCheck(text){ return this.buildLinkHunter(text); },   // the old name

  /* Fold a Link Hunter reply back into a set: `want` are the tracks that
     were missing (in their original order). A reply row is matched to a
     wanted track by artist + title, falling back to its number. Returns
     the wanted tracks that now have a link. */
  matchFound(want, replyText){
    var self = this, got = this.parseReply(replyText).items;
    var key = function(it){ return self._matchNorm((it.artist || '') + ' ' + (it.title || '')); };
    var byKey = {};
    got.forEach(function(g){ if (g.url) byKey[key(g)] = g; });
    var found = [];
    want.forEach(function(w, i){
      var g = byKey[key(w)] || (got[i] && got[i].url && !byKey[key(got[i])] ? got[i] : null);
      if (g && g.url){ w.url = g.url; w.dead = false; w.fake = false; w.repeatOf = ''; w.noLink = ''; if (!w.secs && g.secs) w.secs = g.secs; found.push(w); }
    });
    return found;
  },

  /* Add found tracks to an imported playlist and put the whole set back in
     the order the DJ intended — a found track goes back to its own place,
     not to the end. `all` is every track of the set, in order. */
  async addFound(playlistId, found, all){
    for (var i = 0; i < found.length; i++){
      var tid = await this.storeItem(found[i]);
      await dbBoss.addToPlaylist(playlistId, tid);
    }
    var joins = await db.playlistTracks.where('playlistId').equals(playlistId).sortBy('order');
    var pos = {};
    all.forEach(function(it, i){ if (it.url && pos[it.url] === undefined) pos[it.url] = i; });
    var rows = [];
    for (var k = 0; k < joins.length; k++){
      var tr = await db.tracks.get(joins[k].trackId);
      var p = tr && pos[tr.ytId] !== undefined ? pos[tr.ytId] : 1000 + k;
      rows.push({ id: joins[k].id, p: p });
    }
    rows.sort(function(a, b){ return a.p - b.p; });
    for (var r = 0; r < rows.length; r++) await db.playlistTracks.update(rows[r].id, { order: r });
    return found.length;
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
    var speed = this.state.textMode !== 'details';
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
    s = String(s || '');
    /* Gemini (and some chat apps) hand links back wrapped in a redirect:
       https://www.google.com/url?q=https://www.youtube.com/watch%3Fv%3D…
       Decode first, so the id inside is found either way. */
    if (/%[0-9a-f]{2}/i.test(s)){ try { s = decodeURIComponent(s); } catch(e){} }
    var m = /[?&]v=([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(s)
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
    if (!m) return null;
    /* The prompts now ask for the bare 11-character id rather than a URL
       (it can't be mangled into a redirect). A real id is random, so it
       almost always has a digit, a - or _, or capitals after the first
       letter; an 11-letter word ("Electronica", "Gamesofluck") has none. */
    var id = m[1];
    var idLike = /[0-9_-]/.test(id) || (/[A-Z]/.test(id.slice(1)) && /[a-z]/.test(id));
    return idLike ? id : null;
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

    // anything the closed genre list recognises is a genre, however it is spelled
    if (window.riffGenres && riffGenres.normalize(t).genre) return true;

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
      /* The one-shot reply carries ABOUT:, GENRE: and TRACKS: header lines.
         They are kept (about, genre) and must never be read as a track: an
         ABOUT sentence with a dash in it looks exactly like "Artist - Title". */
      var keyM = /^[#*_\s]*(ABOUT|MOOD|DESCRIPTION|GENRE|TRACKS?)[*_\s]*[:：]\s*(.*)$/i.exec(l);
      if (keyM && l.indexOf('|') < 0 && !self._linkCount(l)){
        var k = keyM[1].toUpperCase(), v = self._clean(keyM[2]);
        if (k === 'GENRE'){ if (!res.genre) res.genre = v; }
        else if (k !== 'TRACKS' && k !== 'TRACK'){ if (!res.about) res.about = v.slice(0, 300); }
        return;
      }

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
        /* "NOT FOUND" / "SEARCH FAILED" / "UNCHECKED" in the link cell is the
           AI being honest that it has no link. The track stays, with no url,
           and riffrolled looks it up from the artist and title. */
        cells = cells.filter(function(c){
          if (/^(NOT[\s_-]*FOUND|SEARCH[\s_-]*FAILED|UNCHECKED|UNKNOWN|N\/A)$/i.test(c)){ it.noLink = c.toUpperCase(); return false; }
          return true;
        });

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
          /* "Artist - Title | ID | 3:42 | genre" (one-shot) puts the id in the
             second cell; the numbered formats put it third or later. */
          var firstId = /\s[-–—]\s/.test(cells[0] || '') ? 1 : 2;
          for (var cj = firstId; cj < cells.length; cj++){
            var bare = self._bareId(cells[cj]);
            if (bare){ it.url = bare; linkAt = cj; break; }
          }
        }

        cells.forEach(function(c, i){
          if (!c || i === linkAt) return;
          if (!it.secs && self._looksLikeDuration(c)){ it.secs = self._secs(c); return; }
          rest.push(c);
        });
        /* "Artist - Title | link | 3:42 | Genre": the one-shot format puts
           artist and title in ONE cell. Split it when what follows is only a
           genre (or nothing), so the genre is not taken for the title. */
        if (/\s[-–—]\s/.test(rest[0] || '') &&
            (rest.length === 1 || (rest.length === 2 && self._looksLikeGenre(rest[1])))){
          var dd = self._splitDash(rest.shift());
          rest.unshift(dd.title); rest.unshift(dd.artist);
        }
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
  /* Invented ids give themselves away. A real YouTube id is 11 random
     characters, so two different ids in one reply sharing a run of five
     characters is roughly a one-in-a-hundred-thousand coincidence. An AI
     making ids up, though, writes "5Vj6h1x2jZ0", "4Jv6h1x2jZ0", "3Jv6h1x2jZ0"…
     — a real reply did exactly that for 13 of 15 tracks. Flagged tracks are
     treated like dead links: their url is dropped and riffrolled looks the
     track up itself. Returns how many were flagged. */
  flagInvented(items){
    var ids = {}, grams = {};
    items.forEach(function(it){ if (it.url && it.url.length === 11) ids[it.url] = 1; });
    Object.keys(ids).forEach(function(id){
      var seen = {};
      for (var i = 0; i + 5 <= id.length; i++){
        var g = id.slice(i, i + 5);
        if (seen[g]) continue;
        seen[g] = 1;
        (grams[g] = grams[g] || []).push(id);
      }
    });
    var bad = {}, pattern = {};
    Object.keys(grams).forEach(function(g){
      if (grams[g].length < 2) return;
      grams[g].forEach(function(id){ bad[id] = 1; if (!pattern[id] || pattern[id].length < g.length) pattern[id] = g; });
    });
    var n = 0;
    items.forEach(function(it){
      if (it.url && bad[it.url]){ it.fake = true; it.fakeId = it.url; it.fakePattern = pattern[it.url]; it.dead = true; n++; }
    });
    return n;
  },

  async checkLinks(items, onProgress){
    var report = { checked:0, live:0, dead:0, renamed:0, offline:false };
    var progress = onProgress || function(){};
    for (var i = 0; i < items.length; i++){
      var it = items[i];
      if (it.fake){ it.dead = true; report.fake = (report.fake || 0) + 1; continue; }   // invented — no need to ask YouTube
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
        it.fake = false;
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

  /** one parsed track into the local library (with its metadata); returns the track id */
  async storeItem(it){
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
          /* The genre field is the closed list (genres.js); what the AI
             actually said is kept as a tag, so nothing it told us is
             lost and Random Mix and search still see its own word. A
             word that matches nothing leaves genre blank rather than
             adding a one-off to a list that exists to stay short. */
          var g = window.riffGenres ? riffGenres.normalize(it.genre) : { genre: it.genre, raw: it.genre };
          if (g.genre) meta.genre = g.genre;
          meta.genreRaw = g.raw;
          var tags = (row.tags || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
          [g.raw, g.genre].forEach(function(w){
            w = String(w || '').toLowerCase();
            if (w && tags.indexOf(w) === -1) tags.push(w);
          });
          meta.tags = tags.join(', ');
        }
        if (Object.keys(meta).length) await dbBoss.updateTrackMeta(it.url, meta);
      }
    } catch(e){ /* meta is best effort */ }
    return tid;
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
      aiAbout: parsed.about || '',          // the one-shot reply's ABOUT line
      totalSecs: total,
      aiAt: Date.now()
    });

    for (var i = 0; i < playable.length; i++){
      var tid = await this.storeItem(playable[i]);
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
    if (this.state.mode === 'seeded' && this.state.seeds.length){
      var f = this.state.seeds[0];
      return 'Journey from ' + (f.title || f.artist || 'your tracks');
    }
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

  /** add the set's tracks to the shared catalogue. The set itself stays in
      this browser (Dexie); the server keeps only the tracks. Anonymous — no
      wallet, no device id. Fire and forget: offline is fine. */
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
