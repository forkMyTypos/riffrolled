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

Search behaviour: D1 first; ≥8 cached matches returns at **zero** YouTube quota cost (`X-Riff-Source: db`). Otherwise one `search.list` call to YouTube, new rows inserted (deduped by `url`), then re-query and return. Quota/rate-limit problems degrade to the cache (`X-Riff-Source: db-stale`) instead of erroring. YouTube results map to your columns as: `name` = video title, `artist` = channel name (best available), `genre` = empty (yours to fill), `url` = full watch URL.

## AI DJ

You say what you want to hear, your own AI writes the playlist, riffrolled turns it into real
YouTube videos and plays them. Copy and paste is deliberate: nobody needs a key, an account or
a subscription to use their own AI, and riffrolled never sees it.

**riffrolled hosts no music.** Every track is a YouTube video played through YouTube's embedded
player, so an AI DJ playlist is a list of YouTube videos — the prompt asks for watch links, and
anything missing or unverifiable is looked up. Copy anywhere in the app should say so.

```
you ask → your AI writes a playlist → riffrolled resolves it → saves it → plays it
                                             │
                     ┌───────────────────────┼───────────────────────┐
              1. the AI's link         2. our catalogue        3. YouTube search
              oEmbed, in the browser   D1 LIKE query           search.list
              no key, no quota         no quota                100 units, budgeted
```

**An AI's video id is a hint, never a fact.** A model reproducing an 11-character id from
memory is guessing at a random string, so a supplied link is validated against YouTube's
keyless `oembed` endpoint *and* checked against the title it claimed to be. Unvalidated ids
never reach the catalogue. Everything resolved lands in `tracks` with `source='ai'`, so each
session makes the next one cheaper for everyone.

Quota is the real constraint — `search.list` is 100 units out of 10,000 a day for the whole
site — so tier 3 is capped per request (`AI_YT_PER_REQUEST`, default 8) and per day
(`AI_YT_DAILY`, default 40, counted in the `ai_lookups` table). Set `AI_YT_DAILY = "0"` to
switch YouTube lookups off entirely and run on free tiers only. The panel always reports what
it spent.

Playlists and session records are **local** (Dexie): an AI playlist is an ordinary `playlists`
row carrying `source:'ai'`, the request and the objective, and `aiSessions` keeps the brief,
the raw reply and what each line resolved to — including what didn't. No request leaves the
browser.

| file | what it is |
|------|------------|
| `public/js/aidj.js` | `aiDj` (prompt, parser, resolver, save) + `aiDjBoss` (the panel) |
| `src/routes/resolve.js` | the three-tier resolver, matching and the quota budget |
| `public/ai-dj-lab.html` | unlinked bench: paste any AI's reply, measure what resolves and how |

`aiDj.adapters` is where the copy/paste step lives. An automatic adapter only has to take a
brief and return reply text — the prompt, parser, resolver and save path are already separate
from it.

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
