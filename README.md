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
  db/queries.js        all SQL (prepared statements only)
  services/youtube.js  the only module that touches YouTube
  utils/response.js    JSON/CORS helpers
```

## Deploy — 100% in the browser, no local tools

**1. Put this folder in a GitHub repo.** Upload the files via github.com (Add file → Upload files) — no git CLI needed.

**2. Create the database.** Cloudflare dashboard → **Storage & Databases → D1 → Create database** → name it `riffrolled`. Copy its **Database ID**.

**3. Point the config at it.** On GitHub, edit `wrangler.toml` in the web editor and paste the ID into `database_id`. Commit.

**4. Apply the schema.** In the dashboard, open the D1 database → **Console** tab → paste the contents of `db/schema.sql` → Run. (Idempotent — safe to re-run any time.)

**5. Create the Worker from the repo.** Dashboard → **Workers & Pages → Create → Import a repository** → pick your repo. Cloudflare reads `wrangler.toml`, builds, and deploys. Every push to the repo auto-deploys from then on.

**6. Add the secret.** Your Worker → **Settings → Variables & Secrets → Add → Secret**: name `YT_API_KEY`, value = your YouTube Data API v3 key. (Get one in Google Cloud Console with the YouTube Data API enabled. Because the key only ever lives in the Worker, you can — and should — leave it unrestricted by referrer and instead restrict it to the YouTube Data API.)

**7. Attach your domain.** Your Worker → **Settings → Domains & Routes → Add → Custom domain** → `riffrolled.com` (the domain's DNS must be on Cloudflare). Done — the site and API are live on one URL.

## Endpoints

| Method | Path                    | Body                              | Returns |
|--------|-------------------------|-----------------------------------|---------|
| GET    | /api/search?q=&limit=   | —                                 | `[{id,name,artist,genre,url}]` |
| GET    | /api/tracks?genre=&limit=| —                                | `[{id,name,artist,genre,url}]` |
| POST   | /api/track              | `{name,url,artist?,genre?}`       | the created/existing track |

Search behaviour: D1 first; ≥8 cached matches returns at **zero** YouTube quota cost (`X-Riff-Source: db`). Otherwise one `search.list` call to YouTube, new rows inserted (deduped by `url`), then re-query and return. Quota/rate-limit problems degrade to the cache (`X-Riff-Source: db-stale`) instead of erroring. YouTube results map to your columns as: `name` = video title, `artist` = channel name (best available), `genre` = empty (yours to fill), `url` = full watch URL.

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
