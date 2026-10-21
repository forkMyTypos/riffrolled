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
  genres.js            the 31-genre closed list + the rules that map an AI's words onto it
  routes/
    search.js          GET  /api/search?q=&limit=
    tracks.js          GET  /api/tracks?genre=&limit= · POST /api/track
    resolve.js         POST /api/resolve — AI DJ playlists → real tracks
    mine.js            proof-of-work minting, difficulty retarget, wallet view
    promote.js         campaigns: pop-up cards and AI brief placements
    stats.js           anonymous counters + link authorship (pays nobody — see below)
    config.js          GET /api/config — the few settings the browser needs
    playlists.js       POST /api/playlist/save
    mixes.js           the Mixes panel: list, open, share, play, report
    channel.js         channel / playlist import
  db/queries.js        all SQL (prepared statements only)
  db/migrations.js     self-applying, append-only — never edit an old one
  services/ingest.js   shared 'verify and store these tracks' step (playlist save + mix share)
  services/youtube.js  the only module that touches the YouTube Data API
  services/oembed.js   keyless "does this video exist" checks
  utils/response.js    JSON/CORS helpers
```

Frontend files worth knowing: `public/js/track-info.js` owns the Track info panel
(it holds a target track, which is why it can show one you are not playing),
`public/js/dock.js` places panels, `public/js/promo-popup.js` draws the promoted
record, and `public/js/aidj.js` + `dj-menu.js` + `dj-data.js` are the DJ.

**Wallet keys** (src/wallet.js, schema 21). A wallet is a *private key* (64 hex, made and
kept in the browser; the one thing to copy to another device) and a *public key*
(`sha256("riffrolled/wallet/v1:" + private)`). The server files everything — ledger,
promotions, contributions, links — under the public key and never stores the private
one; the browser sends the private key in an `X-Riff-Key` header (not the URL, so it
never lands in a log). Wallets from before schema 21 were filed under their private key
(`wallets.pub = 0`); each moves itself to its public key the first time its owner shows
up, and only such legacy rows can move — sending someone's public key as a "private key"
gets you a new, empty wallet. The Mine panel's 🔑 Your keys shows both, with copy and
"use a private key from another device".

The prompts ask for the bare 11-character **video id** (e.g. `dQw4w9WgXcQ`) rather than a
URL — Gemini in particular mangles links into `google.com/url?q=…` redirects. The parser
takes either: a bare id, any YouTube URL form, or a redirect-wrapped one; an 11-letter word
("Electronica") is never mistaken for an id.

**Share with community** (DJ AI, opt-in, off by default). An imported set is also posted to
Mixes → Community (name, ABOUT line, genre, tracks, DJ choices) through the same
`/api/mixes/share` as the Share button — same daily limit, link checks, name rules,
duplicate detection and reports. When Link Hunter is still filling gaps it waits, so the
shared mix is the finished one. Shares carry the private key in `X-Riff-Key`; the server
logs the sharer's **public key** in `mixes.creator` (schema 22) — admin-only, never sent to
listeners — and the daily limit applies per wallet as well as per network. The admin shows
"by rr·…" on each community mix and can hide everything one wallet shared. Community lists
10 at a time (Newest / Popular, then Show more); search covers mix names, blurbs, artists,
track titles and DJ choice values.

**Share approval** (schema 23, `MIX_SHARE_REVIEW`, on by default). Every wallet public key
starts at **sharing:false**. A share now needs a key (401 `needs_key` without one). While a key
is sharing:false its mixes are stored with `mixes.pending = 1` — kept in the database, listed
nowhere, 404 to open — and the page says "sent for a quick check" (HTTP 202, `pending: true`).
The first share also writes a `sharers` row (`pub`, `sharing` 0 / 1 / -1 blocked, `first_at`,
`decided_at`). In the admin tool, **Mixes → Waiting for your OK** shows each waiting key with
exactly what it tried to share (name, blurb, genre, DJ choices, every track); **Approve key** sets
sharing:true and lists its waiting mixes (later shares go straight up), **Reject this mix**
deletes one (the key stays sharing:false), **Block key** sets -1, deletes its waiting mixes and
hides anything it already listed. A key can have 3 mixes waiting at once. The Mixes tab shows a
count badge and the Overview says when something is waiting. `MIX_SHARE_REVIEW = false` lists
shares straight away (blocked keys stay blocked). Mixes listed before schema 23 are untouched.

**Mix links** (schema 24, `src/slug.js`). Every listed mix has a random 8-character code
(`mixes.slug`, unique, from a 31-letter alphabet with nothing that looks like something else,
always at least one letter so it can't be mistaken for a row number). `GET /api/mixes/<id or code>`
opens either; hidden or waiting mixes are 404 by both. `riffrolled.com/?m=<code>` opens the Mixes
panel on that mix (mixes.js reads it at boot). Codes are filled in by the migration for old mixes and
lazily for anything created since; the admin tool's publish writes one too and has a "Copy link"
button. The site is static assets, so a pasted link shows the generic riffrolled card in chat apps,
not the mix's name.

**Promote panel.** Four steps: track (catalogue search with pictures, or a link), where it appears
(each option shows what it looks like), moods (only with the DJ option), credits (with a plain cost
line). "Your promotions" is a separate registered panel with no dock button (`promoBoss.mine`).
`/?promo=now` shows the poster card a few seconds after load for testing.

**Never your own campaign.** The pop-up, DJ-brief and claim calls are anonymous, but the browser sends
its wallet key when it has one (`riffWallet.peekHeaders()`), and the server uses it for exactly one
thing: leaving that wallet's own campaigns out (`livePromotions` / `aiCampaignPool` take an
`exceptWallet`). So a promoter is never shown, or charged for, their own track, a brief they copy
never carries it, and their own plays and likes on it are not counted. It cannot tell two wallets
apart that belong to the same person, so a second wallet on the same device still sees the first one's
campaigns. Admin free campaigns belong to `riffrolled-admin`, so they are shown to everyone, which is
what makes them usable for testing.

**Free test promotions** are made in the admin tool (Promotions tab). They are ordinary rows in
`promotions` owned by the pseudo-wallet `riffrolled-admin`, which has no `wallets` or `ledger` rows,
so nothing is debited or refunded; everything after that (credit spending, brief matching, the
"Promoted" label, sweeping) is the same code as a paid campaign.

**Track Rolled Journey** (DJ AI mode card next to TEXT; `DJ_SEEDED_PROMPT`). The brief is
up to five seed tracks — from what's playing, the library, a pasted link / video id, or
typed "Artist - Title" — plus the DJ personality and the length. One prompt, the same reply
format and import as one-shot (its link-finding, repair and output sections are the
one-shot's, word for word); the seeds are listed with their video ids and kept out of the
mix. Track info has "🎲 Roll a journey from this track". Mode and seeds persist.

The DJ AI has two ways to brief an AI. **One-shot prompt** (`DJ_ONESHOT_PROMPT`): one
prompt; the AI curates the mix, finds and verifies the YouTube links itself and replies
with a finished `RIFFROLLED-PLAYLIST` (`Artist - Title | link | m:ss | genre` lines under
NAME / ABOUT / GENRE / TRACKS). **The Riffenator 🤖🎸** (once "multi-shot"; marked BETTER in the panel, which says why) is a wizard: choose, copy prompt 1
(the DJ brief, `DJ_MULTI_PROMPT`), and a pop-up takes over — step 2 pastes the AI's track
list (a `RIFFROLLED-DJ-DRAFT`, no links), step 3 copies **Link Hunter**
(`DJ_LINK_HUNTER_PROMPT`) and imports its reply. Whatever the mode, a reply that isn't a
full playlist opens a pop-up: no links at all → Link Hunter for every track (nothing is
imported yet); some missing (NOT FOUND, SEARCH FAILED, dead or reused links) → the rest is
imported and Link Hunter is offered for just the missing ones, which go back into their
own places. The pop-up also says why each track didn't make it, grouped: reused links
("→ same video as …"), links that look made up (`djAi.flagInvented`: two different ids
sharing a run of five characters is a fabrication tell — a real reply had 13 of 15 like
"…h1x2jZ0"), dead links, NOT FOUND / SEARCH FAILED, and links that play something else
(imported, but flagged to check). The wizard lives inside the DJ panel, so it can never
cover the player. The
multi-shot texts are word for word the admin tool's `dj_brief_prompt.txt` and
`track_check_prompt.txt` (its tests check), and `THE BRIEF` is filled in from the
listener's choices. Internally the modes are still called `speed` (one-shot) and
`details` (the Riffenator), so saved settings carry over.

The DJ's choices (`DJ_CATEGORIES` in dj-data.js) are the Riffenator vocabulary: each option
has `vibe` (its three describing words, shown in the menu and handed to the AI), `tags`
(those words mapped onto the 29 mood words in src/tags.js — what Riff Roll weights by and
promotions match on; the lint suite checks they stay in that set), and personalities a
`blurb`. `djAi.seed()` brings existing listeners up to date: new options are added, kept
built-ins take the new wording but keep favourites, built-ins that left the list are hidden
(`retired`), and a listener's own options are never touched. DJ AI is first in the dock.

The promoted pop-up is a gig flyer (`img/promote-poster.webp`, a torn-edged poster
with transparent edges) stuck at a slight angle, with the video's picture taped
onto it. The title and the Play / Add / Close buttons appear only
on hover or keyboard focus; on touch screens they are always shown. The small
"Promoted" tag on its bottom edge is always visible, because it is the disclosure. It
sits bottom-right (the deck controls own bottom-left), falls back to the left
if the right would cover the player, and is skipped if neither fits. Add puts
the track in the current playlist. A skipped card does not refund its credit.

Newer frontend pieces: `newhere.js` (first-run state; on a phone a newcomer sees
only Player, Playlist, Search, DJ AI and ⋯ until they play something),
`genres.js` (GENERATED from `src/genres.js` — never edit it by hand; the genres test
rewrites it and fails if the two differ), `artist.js` (artist matching and
"more of this artist"), `remote.js` (the deck's controls — one set of buttons, same ids in every skin — and where they live: docked into the plinth, or in the deck's flow for the Classic skin and on a phone), `skins.js` + `css/skins.css` (record-player skins: `<` `>` arrows that appear only while the pointer is over the record player step through Studio, Walnut, Neon, Chrome and Classic; a skin is `data-skin` + `data-layout` on `#deck`, and the deck-layout finishes are just CSS variables, so a new one is a dozen lines; the choice is a per-device setting, `deckSkin`; phones always get Studio), `screen.js` (video
resizing — the one number is `--vid`, never below 200px) and `deck-title.js` (rename
the playing track from the deck; local to this device, written through
`trackInfo.saveFor`).

**Genres.** `tracks.genre` is one of the 31 names in `src/genres.js` or blank; whatever
word the AI used is kept in `tracks.genre_raw`. Migration 18 normalises the old rows
(batched, safe to re-run). To change the list, edit `src/genres.js` and re-run the genres test.

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

**Mixes.** The Mixes panel (the dock icon under Playlist) has three doors: *By Us* (premade
mixes, added from the admin tool), *Make a Mix* (opens the DJ AI) and *Mixes* (community, shared by
listeners with the opt-in ↗ button on a playlist). A mix is only an ordered list of YouTube links;
riffrolled stores the list, YouTube plays the music. Tables (migration 19): `mixes` (kind
`premade`|`community`, name, blurb, genre, fingerprint — a unique hash of the ordered track ids so the
same list is never stored twice, hidden, sort, plays, reports), `mix_tracks`, `mix_reports` (one report
per person per mix), `mix_shares` (daily limit; pruned after 2 days). People are counted by a salted
hash, never by address. Config keys: `MIX_SHARE_PER_DAY` (default 5; **0 turns sharing off**),
`MIX_SHARE_REVIEW` (default on: a wallet's shares wait for your OK until you approve it once),
`MIX_REPORTS_TO_HIDE` (default 3; community only — premade never auto-hides), `MIX_MIN_TRACKS` (default 3).
In the admin tool the **Mixes** tab pastes a list (any AI can produce it — the tab has a "copy instructions"
button), checks every link with YouTube from your computer, and publishes; ▲▼ sets the order, and
Hide / Show / Delete / Feature moderate community mixes. Deploy the project first: the tab says so if
the tables are missing (`/api/health` should show `"schema":24`).

## Endpoints

| Method | Path                    | Body                              | Returns |
|--------|-------------------------|-----------------------------------|---------|
| GET    | /api/search?q=&limit=   | —                                 | `[{id,name,artist,genre,url}]` |
| GET    | /api/tracks?genre=&limit=| —                                | `[{id,name,artist,genre,url}]` |
| POST   | /api/track              | `{name,url,artist?,genre?}`       | the created/existing track |
| POST   | /api/resolve            | `{items:[{artist,title,videoId?,verified?}], allowYouTube?}` | `{results:[{i,ok,via,url,name,artist}], lookups_used, lookups_left}` |
| GET    | /api/mixes?kind=&sort=&genre=&q=&limit=&offset= | — | `{mixes:[{id,name,blurb,genre,tracks,plays,cover,artists}]}` |
| GET    | /api/mixes/:id          | —                                 | the mix, its `items` (each with the DJ's one-line `note`) and `brief` (the DJ AI choices that made it, or null) |
| POST   | /api/mixes/share        | `{name,blurb?,genre?,brief?,tracks:[{name,artist,genre,url}]}` | `201 {id}` or `{existing:true,id}`; 429 `daily_limit` |
| POST   | /api/mixes/:id/play · /report | —                           | counters; a report is one per person |
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

## How the page loads

Everything the page needs comes from this site: Dexie lives in `public/vendor/` (the exact bytes of dexie@4.4.3), so no CDN can stall startup and the CSP allows no script host except YouTube. Scripts are `defer`red, so they download together and run in order. YouTube's player script is requested only after the page's own `load` event, so a slow YouTube can delay playing a track but never the page.

Panels start closed, and stay invisible (`html:not(.rr-up) .panel`) until `dock.js` has given each its state. `dock.js` also remembers any panel opened or closed before the saved layout finished loading, and the restore leaves those alone. To upgrade Dexie, replace the file in `vendor/` and keep the version in its filename comment.

## Driving riffrolled from code

There is a small, versioned API on `window.riffrolled` (`public/js/agent.js`).
Use it rather than the DOM: it is riffrolled's own code path, it is tested, and
the layout is free to change underneath it.

```js
await riffrolled.state()
// { version:1, ready:true, tracks:42, playlists:3, playlistTracks:15,
//   playing:false, currentId:'', playlistName:'Night Drive' }

await riffrolled.addTracks('https://youtu.be/ID1 ID2 https://www.youtube.com/watch?v=ID3')
// { ok:true, added:3, tracks:[{id,title,trackId}], failed:[], ids:[...] }

await riffrolled.importReply(wholeAiReply)   // parse + check + resolve + build
// { ok:true, imported:12, parsed:15, playlist:'🤖 Night Drive', report:{...} }

await riffrolled.play('ID1')
```

It takes no money, spends no credits and does nothing a person could not do by
hand in the UI. Nothing there can promote a track or touch a wallet.

**URL entry points**, for anything that can only navigate:

| Param | Does |
| --- | --- |
| `?add=ID1,ID2` | adds those videos on load; the count lands in `data-rr-url-add` |
| `?notutorial=1` | skips the first-run tour (also `?agent=1`) |

**Reading state without scraping.** `<html>` carries `data-rr-tracks`,
`data-rr-playlist-tracks`, `data-rr-playing`, `data-rr-current`,
`data-rr-last-added` and `data-rr-last-action`. A `riffrolled:changed`
CustomEvent fires on `window` after anything that alters the library.

**Stable hooks** where the UI is genuinely the thing to drive:
`data-testid` on `paste-box`, `add-tracks-btn`, `paste-status`, `dj-reply`,
`dj-import-btn`, `dj-copy-btn`, `dj-roll-btn`, plus `panel-<slug>` and
`dockbtn-<slug>` for every dock panel, each carrying `data-open="0|1"`.

Do not match on button text. The Add button reads `＋ Add` with a **fullwidth
plus (U+FF0B)**, so a search for `"+ Add"` finds nothing — that single
character is what made one agent conclude the paste box was broken when it was
working fine.

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
pop-up flyer, and the playlist row itself, because that last one is where
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
