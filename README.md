# riffrolled — everything on Cloudflare

One Worker serves the whole product: the vinyl-player frontend as static assets, the JSON API under `/api/*`, and Cloudflare D1 as the database. The YouTube Data API key lives in a Worker Secret and never reaches the browser. **Nothing runs locally — deployment happens through GitHub + the Cloudflare dashboard.**

```
riffrolled.com (one Worker)
 ├── /            → public/index.html  (the player)
 └── /api/*       → Worker code ──> D1 (cache hit? return)
                              └──> YouTube API ──> UPSERT into D1 ──> return
```

Same origin for frontend + API means no CORS headaches at all.

## Project layout

```
wrangler.toml          Worker config: assets, D1 binding, cron trigger, [vars]
public/index.html      the riffrolled frontend (static asset)
db/schema.sql          D1 schema — matches your tracks table; idempotent
src/
  index.js             router + error boundary (/api/*) and the cron entry
  config.js            EVERY tunable number, and the three layers that resolve it
  contrib.js           contribution rewards — a shared pool, not a per-act payment
  sweep.js             hourly housekeeping: finished campaigns, old rows, payouts
  tags.js              the 29-word mood vocabulary, server side
  routes/
    search.js          GET  /api/search?q=&limit=
    tracks.js          GET  /api/tracks?genre=&limit= · POST /api/track
    resolve.js         POST /api/resolve — AI DJ playlists → real tracks
    mine.js            proof-of-work minting, difficulty retarget, wallet view
    promote.js         campaigns: pop-up cards and AI brief placements
    stats.js           anonymous counters + link authorship (pays nobody — see below)
    config.js          GET /api/config — the few settings the browser needs
    playlists.js       POST /api/playlist/save
    channel.js         channel / playlist import
  db/queries.js        all SQL (prepared statements only)
  db/migrations.js     self-applying, append-only — never edit an old one
  services/youtube.js  the only module that touches the YouTube Data API
  services/oembed.js   keyless "does this video exist" checks
  utils/response.js    JSON/CORS helpers
```

Frontend files worth knowing: `public/js/track-info.js` owns the Track info panel
(it holds a target track, which is why it can show one you are not playing),
`public/js/dock.js` places panels, `public/js/promo-popup.js` draws the promoted
record, and `public/js/aidj.js` + `dj-menu.js` + `dj-data.js` are the DJ.

## Deploy

**Use `riffrolled-deploy.html`** — keep it on your own computer, open it in a browser.

1. Connect once with a fine-grained GitHub token (riffrolled repo only, *Contents: Read and write*).
2. Drop the project zip (or folder) onto the page.
3. It shows exactly which files changed, runs safety checks, and Deploy makes one commit.
4. It then watches Cloudflare build it and polls `/api/health` until the site reports
   that exact build — "Live" means serving, not "probably fine".

**Database changes are automatic.** The Worker migrates its own D1 database on the first
API request after a deploy (`src/db/migrations.js`). Nothing to paste into the D1 console.
To change the schema, append a migration there — never edit an old one.

`GET /api/health` → `{ ok, build, schema }` — which build is serving and whether the
database caught up.

One-time setup that still lives in the Cloudflare dashboard: the `YT_API_KEY` secret, the
custom domain, and the WAF rate-limiting rules on `/api/*`.

The hourly Cron Trigger comes from `wrangler.toml`, so it arrives with a deploy — no
dashboard step. To confirm it took: Worker → Settings → Triggers → Cron Triggers.

## Endpoints

| Method | Path                    | Body                              | Returns |
|--------|-------------------------|-----------------------------------|---------|
| GET    | /api/search?q=&limit=   | —                                 | `[{id,name,artist,genre,url}]` |
| GET    | /api/tracks?genre=&limit=| —                                | `[{id,name,artist,genre,url}]` |
| POST   | /api/track              | `{name,url,artist?,genre?}`       | the created/existing track |
| POST   | /api/resolve            | `{items:[{artist,title,videoId?,verified?}], allowYouTube?}` | `{results:[{i,ok,via,url,name,artist}], lookups_used, lookups_left}` |
| POST   | /api/playlist/save      | `{name, tracks:[{name,artist,genre,url}]}` | `{id, name, tracks}` — riffrolled's own copy of a set |
| GET    | /api/config             | —                                 | the handful of settings the UI needs, plus the mood vocabulary |
| POST   | /api/mine/challenge     | `{wallet}`                        | `{challenge, difficulty_bits, reward, tier, …}` |
| POST   | /api/mine/submit        | `{wallet, challenge, nonce}`      | `{ok, reward, balance}` |
| GET    | /api/wallet?wallet=     | —                                 | balance, difficulty and why it is what it is, contribution standing |
| GET    | /api/ledger?wallet=     | —                                 | recent mints and spends |
| POST   | /api/promote            | `{wallet, url, credits, modes, tags?, label?}` | the new campaign |
| GET    | /api/promotions         | —                                 | live campaigns, for display only — **never** billed |
| GET    | /api/promotions/next    | `?mode=popup\|ai&exclude=`        | one campaign, **and one credit spent** |
| GET    | /api/promotions/mine?wallet= | —                            | the owner's campaigns and their numbers |
| POST   | /api/promotion/action   | `{wallet, id, action, credits?}`  | pause / resume / add credits |
| POST   | /api/promo/event        | `{id\|url, kind}`                 | engagement only — cannot move money |
| POST   | /api/promotions/brief   | `{brief_id, tags:[]}`             | up to 3 matching placements, **free** |
| POST   | /api/promotions/brief/claim | `{brief_id}`                  | charges one credit per placement, once |
| POST   | /api/stats              | `{plays?, likes?, dislikes?, linkFollows?}` | anonymous counters |
| POST   | /api/link               | `{wallet, a, b}`                  | publish a link between two tracks |

Search behaviour: D1 first; ≥8 cached matches returns at **zero** YouTube quota cost (`X-Riff-Source: db`). Otherwise one `search.list` call to YouTube, new rows inserted (deduped by `url`), then re-query and return. Quota/rate-limit problems degrade to the cache (`X-Riff-Source: db-stale`) instead of erroring. YouTube results map to your columns as: `name` = video title, `artist` = channel name (best available), `genre` = empty (yours to fill), `url` = full watch URL.

## The economy

Three things create or move credits. Everything else is display.

**Minting — proof of work.** The browser grinds SHA-256 until it has enough
leading zero bits; the Worker verifies in one hash. Challenges are single-use
and expire.

    effective bits = clamp(BASE + retarget − tier discount, FLOOR, CEIL)

There is **no per-wallet daily cap**, and there deliberately never will be again.
A wallet is 64 random hex characters, so a per-identity cap bound only the honest
user with one wallet. The brake is difficulty, which binds everybody equally: the
retarget raises it when the whole site mints faster than `MINE_TARGET_PER_HOUR`
and **never lowers it below your base**, because if a quiet hour made mining
cheap then waiting for a quiet hour would be the cheapest way to mine. Wallets
that joined early get a permanent discount in bits — safe against the trick that
killed the cap, since your CPU is the constraint and every wallet you hold gets
the same discount.

**Spending — one credit is one person's attention.** A credit buys the chance to
be seen, not a play. It is spent in exactly two places, both server-side:

* `GET /api/promotions/next` — the server picks the campaign *and* debits it in
  one step. The browser used to run that lottery, which meant a stranger could
  drain a rival's campaign with a loop.
* `POST /api/promotions/brief/claim` — one credit per placement when a DJ brief
  is **copied**, not when the resulting playlist is imported. Copying is the
  moment the track was definitely in front of a person. The claim carries only a
  brief id; naming campaigns would reopen the drain.

`POST /api/promo/event` can be called a million times and cannot move a balance.

**Contribution rewards — a shared pool.** `src/contrib.js`. Points are awarded
only for things the Worker observed itself: being the *first* to add a video that
YouTube confirmed exists, and publishing a link nobody had published. Each period
a fixed pool (`CONTRIB_POOL_PER_EPOCH`) is divided among contributors by points.

This is the shape it is for one reason. The play and like counters in
`/api/stats` arrive with no wallet and no session, so the server cannot tell a
listener from a loop — they are fine for ranking a catalogue and **cannot** back
a payout. Nothing in the reward path reads them. And because the pool is fixed,
flooding the catalogue moves your *share*; it cannot create credits. Ships at
`CONTRIB_POOL_PER_EPOCH = 0` (off) — turn it on when you have watched it.

### Tuning

Every number lives in `src/config.js` `SCHEMA`, resolved most-specific-first:

1. the `config` table in D1 (what the admin tool edits)
2. the matching `[vars]` entry in `wrangler.toml`
3. the shipped default

Values are re-validated against their range on read, so a bad row — however it
was written — cannot take effect. A key that is not in `SCHEMA` is **refused**,
not stored and ignored: a silently-ignored setting is worse than a rejected one.
`MINE_DAILY_CAP` is gone for exactly that reason, so a stale row will now error
in the admin tool rather than look like a dial that does something.

### Housekeeping

`[triggers] crons = ["17 * * * *"]` runs `scheduled()` → `src/sweep.js` hourly:
deletes campaigns that spent their last credit over `PROMO_SWEEP_HOURS` ago,
prunes uncopied brief offers and old mint-rate buckets, and pays out any closed
reward period. Each step is wrapped separately — one broken step must not stop
all housekeeping forever — and the payout claims the period *before* crediting
anybody, so a retried sweep cannot pay twice.

The grace period before deleting a campaign is not arbitrary: the owner's browser
copies a finished campaign's numbers into local storage (`promoArchive`) and the
sweeper waits long enough for that to have happened. Nothing breaks without the
cron; tables just keep rows they no longer need.

### Disclosure

Promoted tracks are labelled wherever they appear — the promoted strip, the
pop-up record, and the playlist row itself, because that last one is where
somebody actually listens. The DJ brief says it in words too, since the badge
depends on a fetch that can fail.

## DJ AI

An interactive prompt builder. You set the coordinates, your own AI writes the set, riffrolled
imports it. **riffrolled calls no AI and touches no YouTube API here** — the AI is told to verify
its own links, and what comes back is taken at its word. A dead id simply fails on the deck,
which the player already handles by skipping.

```
      brief  →  COPY  →  (whichever AI you already have)  →  PASTE  →  playlist
        │                                                                  │
   dj-data.js: categories, options, tags                      Dexie playlist + D1 copy
```

Inside TEXT there are **two ways to brief**: ⚡ **Speed mode** asks four questions — what you're
doing, how it should feel, where to go, who's on the decks — all defaulting to "don't mind", with
length on one line and everything else behind **More settings**. 🎛 **The details mode** is the
full desk. They send genuinely different prompts: speed says *decide and keep moving*, details
says *take me somewhere*. The speed template lives in `dj-data.js` as `DJ_SPEED_PROMPT`, which is
the thing most worth rewriting as we learn what different AIs do with it.

In Speed mode the main **RIFF ROLL** rolls the four, builds the prompt, copies it and shows what
it used, in one press. A section's own 🎲 never copies — those are for nudging a brief you're
still building. The roll only touches what's on screen, so anything you set under More settings
survives it.

**DJ thinking time** is estimated from the track count and whatever else the brief asks for
(~4s a track in speed, ~10s in details, plus extras, sharing and chaos) — constants in
`DJ_TIME`. It's a guess and the wording says so.

Three modes sit at the top of the menu. **TEXT** (copy + paste) is the whole of it today;
**YOUR AI** and **RIFFROLL IT** are marked coming soon and implement nothing. They replace the
middle step only — brief, parser and import are already independent of how the AI is reached.

**Riff Roll** is the central mechanic. Every option carries a few tags (`Night drive` → dark,
night, motion, solo); shared tags mean related; the roll *weights* the dice by overlap but never
filters, so `Funeral + Euphoric + Metal + 90% familiar` stays reachable. Linked is not
constrained. **Chaos Mode** inverts the weighting for some sections *and says so in the brief* —
without that sentence an AI reads a strange combination as contradictory instructions and
returns mush; with it, the collision becomes the commission.

Every section has its own 🎲 (which never lands on what you already had), a searchable picker
with favourites and use counts, and room for your own options. Whole categories can be added;
`Energy`, `Era` and `Speed` ship switched off under **More settings**. All of it is data —
`public/js/dj-data.js` seeds Dexie once, and the vocabulary belongs to the user after that.

**Time** is a first-class control because a text brief can't fix a 28-minute track on its own:
track count, total minutes, a per-track ceiling, and the implied average shown live. The AI
reports each track's running time, so an imported set knows what it runs to.

**DJ KNOWS** is one toggle and a plain list of what it would share (most played, likes, recent,
your tags, artists you already own). Off means the brief says "choose blind".

What comes back is logged: artist, running time and genre land on the local track (genre also
becomes a tag), and the set is posted to D1 as a name plus track ids — anonymous, no wallet, no
device id. That is riffrolled's own record of which tracks belonged together.

| file | what it is |
|------|------------|
| `public/js/dj-data.js` | the vocabulary: categories, options, tags, personality voices |
| `public/js/aidj.js` | `djAi` — state, roll, prompt, parser, import, history |
| `public/js/dj-menu.js` | `djMenuBoss` (the menu) and `djHistoryBoss` (past sets) |
| `src/routes/playlists.js` | `POST /api/playlist/save` — name + track ids |
| `public/ai-dj-lab.html` | unlinked bench: paste a reply, see what the parser makes of it |

Playlists and tracks deliberately never appear in the DJ AI menu: an imported set goes straight
to the Playlist panel and starts playing. `/api/resolve` is dormant — nothing calls it now that
the AI does its own verifying.

## Links

One table for every relationship between two tracks, replacing the old `trackLinks` (hand-made)
and `trackPairs` (observed) tables.

```
links: type | origin | a | b | count | score | createdBy | firstTs | lastTs
```

**Two origins.** `manual` is a person saying these belong together — it has an author, and it is
the kind that can earn its maker something when other people follow it. `auto` is riffrolled
noticing; no author, nobody paid, evidence only. A person claiming a link riffrolled had only
observed upgrades the row to manual and keeps the evidence already gathered.

**Direction is a property of the type.** `PLAY_ORDER` is directional: `a → b` means a was played
*before* b, and one row answers both "what follows a" (`linksFrom`) and "what comes before b"
(`linksTo`). Undirected types like `RELATED` sort their endpoints so one row serves both ways.
The old `trackPairs` sorted everything, which threw the direction away at write time — those rows
are dropped on upgrade rather than carried over as something they aren't.

**Play order is gated.** A track that played for three seconds before you skipped it is evidence
of dislike, not of sequence; one resumed three hours later is a new session. `PLAY_DWELL_MS` and
`PLAY_GAP_MS` decide, from the dwell time the player passes in.

**`count` and `score` are separate.** Count is raw evidence and is only ever incremented; score is
what consumers rank by and today equals count. A cleverer score later — recency, likes, skips —
gets recomputed without destroying what it was computed from.

**SAME_PLAYLIST is derived, not stored.** `playlistTracks` already holds every membership, so
`dbBoss.samePlaylist(ytId)` is a query: always current, never stale after an edit, and incapable
of exploding. Materialising it would write n(n−1)/2 rows per playlist — two million for a single
2,000-track channel import, and the least meaningful links in the database.

Endpoints are ytIds rather than row ids, so links survive export, import and a second device.

## Tutorial Mode

`public/js/tutorial.js` — seven steps over the real UI (listen → discover → choose → promote),
opening the actual panel each step is about and closing it again afterwards. Auto-runs once on
a first visit with an empty library, then lives behind the button in **About & Legal** and on
the empty-deck hint. `tourDone` in settings is the only state it keeps.

## Frontend → API

Same origin, so the client is trivial — relative URLs, no base to configure:

```js
const riffApi = {
  async search(q, limit = 20) {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`);
    if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
    return r.json();   // [{ id, name, artist, genre, url }]
  },
  async addTrack(track) {   // { name, url, artist?, genre? }
    const r = await fetch('/api/track', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(track),
    });
    return r.json();
  },
  async byGenre(genre) {
    return (await fetch(`/api/tracks?genre=${encodeURIComponent(genre)}`)).json();
  },
};
```

The frontend keeps Dexie for offline caching; API results can be merged into it with the existing `dbBoss.createTrack`. Nothing in the browser knows YouTube's API exists.

## Updating the site

Edit `public/index.html` (or any Worker file) on GitHub → commit → Cloudflare auto-builds and deploys. That's the whole release process.

## Extending

- **FTS**: swap the `LIKE` search in `db/queries.js` for an FTS5 mirror table when the catalogue grows.
- **Auth**: add a bearer-token check in `index.js`'s route loop.
- **More tables** (playlists, reactions): add them to `schema.sql` and a route file each when you actually need them server-side — the earlier full-spec version of this backend is the blueprint.
- **New endpoints**: one file in `src/routes/`, one line in the `ROUTES` table.
