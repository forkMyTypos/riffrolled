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
wrangler.toml          Worker config: assets + D1 binding
public/index.html      the riffrolled frontend (static asset)
db/schema.sql          D1 schema — matches your tracks table; idempotent
src/
  index.js             router + error boundary (handles /api/*)
  routes/
    search.js          GET  /api/search?q=&limit=
    tracks.js          GET  /api/tracks?genre=&limit= · POST /api/track
    resolve.js         POST /api/resolve — AI DJ playlists → real tracks
  db/queries.js        all SQL (prepared statements only)
  services/youtube.js  the only module that touches YouTube
  utils/response.js    JSON/CORS helpers
```

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

## Endpoints

| Method | Path                    | Body                              | Returns |
|--------|-------------------------|-----------------------------------|---------|
| GET    | /api/search?q=&limit=   | —                                 | `[{id,name,artist,genre,url}]` |
| GET    | /api/tracks?genre=&limit=| —                                | `[{id,name,artist,genre,url}]` |
| POST   | /api/track              | `{name,url,artist?,genre?}`       | the created/existing track |
| POST   | /api/resolve            | `{items:[{artist,title,videoId?,verified?}], allowYouTube?}` | `{results:[{i,ok,via,url,name,artist}], lookups_used, lookups_left}` |
| POST   | /api/playlist/save      | `{name, tracks:[{name,artist,genre,url}]}` | `{id, name, tracks}` — riffrolled's own copy of a set |

Search behaviour: D1 first; ≥8 cached matches returns at **zero** YouTube quota cost (`X-Riff-Source: db`). Otherwise one `search.list` call to YouTube, new rows inserted (deduped by `url`), then re-query and return. Quota/rate-limit problems degrade to the cache (`X-Riff-Source: db-stale`) instead of erroring. YouTube results map to your columns as: `name` = video title, `artist` = channel name (best available), `genre` = empty (yours to fill), `url` = full watch URL.

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
