# riffrolled — checklist

Dan's running to-do list. `[ ]` open, `[x]` done, `[?]` needs a decision from Dan first. Bandcamp is parked on purpose.

## Round: the 8M-row spike — daily channel recount, rate limits, edge cache, request logs (20 Nov, still schema 36, backend only)
- [x] **What happened:** D1's free 5,000,000 rows read for the day ran out. The dashboard's Rows read chart shows one spike of ~8M at 00:17 UTC — the hourly cron's once-a-day channel recount (`src/channels.js` discover() step 1). It asked each channel "how many verified tracks?" separately, and with no table statistics SQLite answered from the *verified* index, reading every verified track for every channel (~2,000 × ~4,000). It grows with channels × tracks, so it got worse each day. Not an attack. Grok's road test the same day was ~1M on top (72 searches that found almost nothing, 53 auto-mix lookups).
- [x] **Fix:** the recount is now one grouped pass over tracks (`UPDATE … FROM (SELECT … GROUP BY channel_id)`), and only rewrites channels whose numbers changed. Same results (checked against the old query on 8,000 tracks / 2,000 channels); ~10k rows instead of ~8M, and far fewer writes.
- [ ] **Dan: deploy before 00:17 UTC** — the reads come back at 00:00 UTC, and the old code would spend them again 17 minutes later.
- [x] **Per-visitor rate limits** (`src/guard.js`, `[[ratelimits]]` in `wrangler.toml`): every `/api/*` call 120 a minute (`RL_API`); searches, track lists, imports, auto mixes, resolve, shares 30 a minute on top (`RL_HEAVY`). Per address, IPv6 per /64. Over: 429 + Retry-After 60. Fails open. `/api/health` exempt. Works alongside the dashboard rule (30 / 10 s).
- [x] **Edge cache:** `/api/search`, `/api/tracks`, `/api/mixes` (list and one mix) kept 60 s, `/api/config` 5 min, at the Cloudflare location. A repeat costs no reads and isn't counted against the limit. Never anything sent with a wallet key. Header `X-Riff-Edge: hit` shows a cached answer.
- [x] **Cheaper search misses** (`src/routes/search.js`): one letter → `[]` at once; after a YouTube fallback the new rows are read back by url (indexed) instead of a second pass over the catalogue.
- [x] **Request logs on** (`[observability]`): paths, statuses, and a "rate limited: …" line for each 429, on the Worker's Observability tab.
- [ ] Dan: after deploying, check /api/health, then in PowerShell (costs no database reads — one-letter searches stop before D1; paced under the dashboard rule): `1..35 | % { Start-Sleep -Milliseconds 400; try { (Invoke-WebRequest "https://riffrolled.com/api/search?q=a&n=$_" -UseBasicParsing).StatusCode } catch { $_.Exception.Response.StatusCode.value__ } }` — 30 × 200, then 429.
- [ ] **Next:** full-text index (FTS5) so a search reads only matching rows — the real fix. Per-visitor limits slow one visitor down; they can't stop many at once while every missed search costs a whole-table read.

## Round: colour themes, and making your own (19 Nov, still schema 36, frontend only)
- [x] **Every colour is a theme variable.** ~1,100 colours in the main stylesheets now read from `css/themes.css` (defaults = Neon Noir, looking as it did; a few near-identical shades were merged). The record player's hardware and skins are left alone, and the record player stays dark in light themes.
- [x] **Nine themes:** Neon Noir (default), Void, Amber Drive, Ice Circuit, Blood Moon, Gunmetal (was "Chrome": a skin already has that name), Soft Terminal (mono font), Toxic, Paper (light mode). Cut from Grok's twelve as near-copies: Hotline, Deep Current, Ghost (any of them can come back as one line in `PRESETS`).
- [x] **🎨 Themes panel:** in the dock just above About; on phones on the More page. A card per theme, ✓ on the one in use; switching fades across for half a second.
- [x] **Make your own:** name, background, text (auto or picked), accents 1–3, highlight, glow, font. The whole site changes live; Cancel puts the old theme back. A readability guard pushes text and accents until they read and says so ("Text colour adjusted so it stays readable").
- [x] **Share / paste:** ⤴ on your theme copies `riffrolled.com/#theme=v1~…`; opening it previews the theme with "Keep it?". Paste a link or code in the panel to add one. Edit ✎ and delete ✕ (with Undo).
- [x] Saved in this browser (`localStorage`), applied before the first paint; backups now carry your own themes. Panel colours follow the theme. Self-test still 27 / 27 (default and Paper).
- [ ] Dan: after deploying, open 🎨 Themes and click through the nine; try Paper on the phone.
- [ ] Later, maybe: a Community gallery of shared themes; Studio skin tinted to the theme.

## Round: one-press sharing, /mix/ links, link previews (19 Nov, still schema 36)
- [x] **SHARE copies straight away** (deck key and a Playlist window's Share): makes or reuses the playlist's link, copies it ("Playlist link copied" toast, Copy button says "Copied!" for 2 s), and opens the link card. The copy is claimed at the press (ClipboardItem with a promise) so Safari allows it even when the link has to be made first. No playlist yet → the old menu opens. `public/js/share.js`, `public/js/playlist.js`.
- [x] **Link card:** link + Copy, Share… (the device's share sheet, wherever the browser has one), Post on X, Share on Facebook; under "More": send only the playing track, Share to Community…, your shared mixes. On phones the share sheet opens first. `public/index.html`, `public/css/skins.css`.
- [x] **Clean links:** `riffrolled.com/mix/<code>`. `/p/<code>`, `/playlist/<code>`, upper case and a trailing slash redirect there (301). Old `/?m=<code>` links still open. After opening, the address goes back to `/`.
- [x] **Link previews:** `src/routes/mixpage.js` serves index.html at `/mix/<code>` with the mix's name and first tracks in og:/twitter: tags, `<base href="/">` (that page's CSP allows `base-uri 'self'`), and the preview image `public/img/og-card.png` (1200 × 630). The homepage has default preview tags. `wrangler.toml` gains `binding = "ASSETS"`.
- [ ] Dan: after deploying, paste a /mix/ link into https://www.opengraph.xyz/ or Discord to see the preview. X caches previews, so an old link may show the old (empty) card for a while.

## Round: Background play switch (18 Nov, still schema 36)
- [x] "Background play" switch under the deck (desktop) / next to Awake (phones). Off by default: music pauses when the tab is hidden and resumes on return. On: keeps playing. Saved as setting `bgPlay`. Files: `public/index.html`, `public/js/player.js`, `public/css/deck.css`.

## Round: homepage legal footer for the YouTube review (18 Nov, still schema 36)
- [x] Always-visible footer on the homepage: Terms · Privacy · Videos play on YouTube · Contact (`index.html` #siteFoot, styles in `features.css`). Bottom-left on desktop; above the tab bar on the phone's Player view.
- [x] Evidence files for the YouTube audit form made from the deployed pages (privacy PNG, terms PDF/PNG, homepage PNG).

## Round: free link finding, one-click Haiku, YouTube review (17 Nov, still schema 36)
- [x] **Three new free link steps** (`src/ai/automix-ai.js`): `discogs` (the release's own YouTube videos; free token), `brave` (Brave web search; stops at `AI_BRAVE_MONTHLY`, 900, to stay inside Brave's free $5 a month), `musicbrainz` (official YouTube links on recordings; free, slow, off by default). Every link still has to pass the oEmbed title + channel check.
- [x] **One call budget per mix** (`AI_CALL_BUDGET`, 40): every link step and every oEmbed check takes from it, so the Workers free plan's 50 outside requests are never exceeded. (Replaces a module-level counter that two mixes at once could share.)
- [x] **Built-in defaults are now the best-value setup:** Haiku picks (Llama 70B backup); links: catalogue → guess → discogs → youtube → brave → hunt; Link Hunter = Gemini 3.6 Flash only, 3 songs, 3 searches; `AI_PICK_HINTS` 60; `AI_YT_DAILY` 50; `AUTOMIX_DAILY` 50.
- [x] **Admin AI tab → Mix creator card:** what's picking the songs, "Upgrade to Claude Haiku 5.5" (paste the Anthropic key right there), a checklist of the free link sources with key boxes, and "Use the best-value setup" (puts those settings back to built-in, shows what changes first).
- [x] **YouTube review fixes** (see `YOUTUBE-REVIEW.md`): on phones the video stays pinned above every tab once loaded (was hidden while playing); playback pauses while the tab is hidden and resumes on return (`bgGuard`); Terms and Privacy say "uses YouTube API Services" / "agree to be bound by the YouTube Terms of Service", disclose promoted content as ads, list the new AI and search services; standalone pages at `/terms` and `/privacy` (text shared with the in-app panel via `js/legal-text.js`).
- [ ] Dan: get a free Discogs token and (optionally) a Brave key with its free credit; paste them in the Mix creator card.
- [ ] Dan: set up `hello@riffrolled.com` with Cloudflare Email Routing before applying to YouTube.
- [ ] Later: Made For Kids status in the 30-day refresh (see `YOUTUBE-REVIEW.md`).

## Round: AI tab you can read, and what it costs (17 Nov, still schema 36)
- [x] **Models chosen from a list**, not typed: "Use / If that fails / If that fails too" for the Picker and the Link Hunter, each model shown with ≈ $ a mix and whether its key is set. Says plainly which model is really in use and why ("needs a key from Anthropic; until then: Llama 3.3 70B"). "Something else…" still takes any `provider:model`.
- [x] **What it costs** panel: ≈ $ per mix (Picker + Link Hunter + Serper; oEmbed and YouTube are free), a month at N mixes a day, and the most it could cost at the site's daily limit. A price list of every model (per 1M tokens, per web search, per mix in each job).
- [x] **Real cost of each mix:** the Worker now logs tokens in/out for the Picker and the Link Hunter (step `pick` and `hunt` in `automix_runs.steps`); the admin prices them. "Cost per mix" card and a Cost column in Recent runs.
- [x] Default Link Hunter backup is now Gemini 3.6 Flash (Google's dates for 2.5 Flash conflict).
- [x] Plainer words: auto mixes = MAKE MY MIX; the final YouTube check is free (1 of 10,000 daily quota units) and catches length, which oEmbed can't; the prompt box says to deploy first; API keys are site-wide Worker secrets and the bill is Dan's.
- [ ] Dan: with Haiku 5.5 for both jobs, a mix is roughly $0.09 (almost all of it the Link Hunter's web searches). At the default limit of 300 mixes a day that could reach ~$800 a month: lower "Auto mixes per day, whole site" until sign-in exists.

## Round: AUTO mixes made by a real music brain (17 Nov, schema 36)
- [x] **Why "Deus Ex, futuristic" gave an Amadeus interview:** the catalogue search matched "deus" inside "Amadeus", the catalogue holds non-music uploads from channel harvests, and the free Llama 8B could only pick from that list.
- [x] **Two steps now** (`src/ai/automix-ai.js`): 1 · the **picker** model names real songs from its own knowledge (soundtrack + kindred artists for a game/film/artist request; songs only, no interviews/EPs/mixes); 2 · **link steps** in a configurable order: catalogue → guess (picker's own id, oEmbed-checked, free) → hunt (Link Hunter: a model with web search) → serper → youtube. Every found video must match the song's artist and title before it's used.
- [x] **Any model** (`src/ai/models.js`): `provider:model` with `|` backup chains. Workers AI (no key), Anthropic, OpenAI, Gemini, OpenRouter. Web search for the hunter via each provider's own tool.
- [x] Catalogue matching is whole-word, and interviews / trailers / reviews / panels / gameplay etc. never go into a mix.
- [x] Every run logged in `automix_runs` (last 1000): picker, per-step handed/linked, every song and how it got its link.
- [x] **Admin ✨ AI tab:** try a mix, hit rates per step, recent runs, models, step order, numbers, prompts, API keys (Worker secrets: add / replace / remove).
- [ ] Dan: add an `ANTHROPIC_API_KEY` (or another provider's) in the AI tab, raise AUTOMIX_PER_DAY while testing, make ~10 mixes, then read the hit rates and decide whether Serper earns a place.
- [ ] Google sign-in gate for the paid models (planned tiers) — not built; today the daily limits are the only cap.

## Round: audit fixes, no Haiku yet (17 Nov, schema 35)
- [x] **Share to X / Facebook.** Send this playlist / Send the track: the share menu turns into a link card: the link (already copied), Copy link, Post on X, Share on Facebook, and on a phone "More apps…" (the phone's share sheet). Counted as `share_x` / `share_fb`.
- [x] "Say what kind of music first" clears the moment a style is added (`dj-menu.js`).
- [x] **Tidy titles** on the deck and in playlists: "(Official Video)", "[Full EP]", "[HD]", " | Label" tails and a leading "Artist - " (when the artist is shown beside it) are dropped from what's shown. Stored names don't change; the full title is on hover. Long titles wrap to two lines (`cleanTitle` in `ui.js`).
- [x] **Auto mixes keep to songs:** catalogue candidates skip long-form titles (Full EP / album, hour mixes, live sets, compilations) and anything longer than `GROW_MAX_MINUTES` (12) or under 1 minute once its length is known. New column `tracks.secs`, filled for free by the 30-day refresh and by the check below.
- [x] **Auto mix check (1 unit a mix):** the finished mix goes through videos.list once; a track that's unembeddable or the wrong length is swapped in place for another catalogue candidate (also checked), so the mix keeps its length. Setting `AUTOMIX_CHECK`. Units are logged as `check:<day>` in ai_lookups.
- [x] **Blocked at play time:** in an auto-mix playlist, a track that won't play (101 / 150) is swapped for one more track in the same styles (`POST /api/automix/swap`, catalogue only, not counted against the 3 a day) instead of just being removed. Each listener's block is counted once; at `AUTOMIX_BLOCKS` (2) listeners auto mixes stop choosing it. It stays in the catalogue.
- [x] **Mine and Promote always shown, at the bottom of the dock** (with About), not hidden from new visitors (Dan's call, 17 Nov). On a phone they're last on the More page under "Earn credits to promote a track".
- [x] **Spin toggle hidden** until it does something (`#spinWrap hidden`).
- [x] **Resize corner flush** with the record player's lower-right corner (it sat 32px in), no grey hover square; a faint grip shows on hover.
- [x] **Phone ⋯ More tab, always:** the tab bar is Player, DJ AI, Playlist, Mixes, Search (just DJ AI, Playlist, Search while new) and More. More is a page listing History, Import, Database, About, and under "Earn credits to promote a track", Mine and Promote.
- [ ] Next: Haiku two-step flow (pick freely → match to the catalogue → guess the link → oEmbed check), then measure the hit rate before deciding on Serper.
- [ ] Ten premade daily mixes for the Mixes panel; first-visit mix picker to replace the tour; TRACK ROLLED one-click with Haiku.

## 0 · Decided (22 Oct)
- [x] **Promote vs Share:** split. The gig flyer stays the **Promote** dock icon (spend credits so strangers see a track); the cassette-and-arrow is the **Share** button, right after prev / play / next (send a track, playlist or mix to a person).
- [x] **Promoting a mix:** single tracks only for now. Revisit after launch.
- [x] **5-minute cooldown:** contributions only (adding a verified track, linking two tracks): one credited action of each kind per wallet every 5 minutes. Mining keeps its own brake (difficulty). Likes and views earn nothing.
- [x] **A reason to bring others:** start with (b): shared mixes show who shared them (short public key) and how many plays they have had. No credits involved.

## 1 · DJ AI
- [x] The chosen mode is obvious: filled, outlined twice and ticked ✓ (the others are plain).
- [x] Link Hunter rewritten: one job, three searches per track, clear match rules, one output format. SEARCH FAILED now only means "could not search the web at all"; if the AI could search, the answer is an ID or NOT FOUND. Site and admin copies are word for word the same (tested).
- [x] `selftest.js` brought up to date with the current prompts (26 of 26 pass on `riffrolled.com/#test`).
- [x] **Grok** next to ChatGPT, Claude and Gemini. grok.com takes `?q=`, but every DJ prompt is far too long for a link, so like the others it opens plain and the brief goes by the clipboard.

## 2 · Playlists as windows (desktop only)
- [x] ⧉ next to a playlist in the playlist list opens it in a window of its own.
- [x] Hover the Playlist dock button: the open playlists (minimized ones too, and the playing one even if its window is closed); click one to bring it to the front.
- [x] A minimize button (–) on every playlist window, the main one included.
- [x] Close closes the window; the music keeps playing.
- [x] One playlist plays at a time: starting a track in another window switches to it, and the playing window says "♪ playing". Showing another playlist does not hijack what is playing.
- [x] Open windows come back after a reload. Phones keep one playlist window.

## 3 · Share
- [x] SHARE key with your cassette-and-arrow picture, right after NEXT. Menu: copy a link to this track (`riffrolled.com/?t=<id>`), a link to this playlist (only people you send it to), share this playlist in Community, and your shared mixes with their plays. The menu never covers the YouTube player (on a phone it is a sheet above the tab bar).
- [x] Mixes shareable by link (`?m=<code>`).
- [x] Share links for a single playlist: link-only mixes (kind `link`: in no list, opened by the link). Same rules as Community: wallet key, daily limit, and a new key's first share waits for your OK in admin → Mixes.
- [x] Opening a track link puts it in "Shared with me" and shows it; nothing plays until pressed.

## 4 · Credits and reasons to come back
- [x] 5-minute cooldown on credited contributions (add a track, link two tracks), per wallet and per kind, server-side in one place (`src/contrib.js`). Setting: `CONTRIB_COOLDOWN_SEC` (300; 0 = off). Only matters once `CONTRIB_POOL_PER_EPOCH` is switched on.
- [x] A reason to bring people: shared mixes can show "shared by rr·abc123" (only if the sharer ticks the box; older mixes never do) and their play count. Mixes → Community → **Yours** lists what you shared, link-only and waiting ones included, with plays.
- [x] Admin tool: free test promotions.

## 5 · Your music
- [x] History (new icon) has tabs: 👍 Liked (most liked first), ▶ Most played, Recent, DJ sets. Play or add any row; "Make a playlist of these". Kept in the browser only.
- [x] Plays per track on the deck (▶ next to 👍 👎), counted in this browser.

## 6 · Mixes
- [ ] **Create our premade mixes** (admin tool → Mixes → the three steps). Dan-side, also in "Before going public".
- [x] Random Mix is now the fourth door in Mixes; its dock button is gone.
- [x] A premade mix can have a cover picture: admin → Mixes → Tracks → "Use as cover" on any of its own tracks (schema 26).

## 7 · Playlist menu, search, genres, windows
- [x] Playlist window pass: ▾ switcher next to the name (drops the list below it), clearer search placeholder, the name looks editable, Share uses the cassette icon. A bigger visual redesign wants your eye: say what you would change.
- [x] Search fixed. It only matched track titles, so typing an artist found nothing; now every word must appear in title, artist, genre or tags. Below your library it shows riffrolled's catalogue (free), and "Search YouTube" is an explicit button. Clicking a playlist opens it.
- [x] Genres rule: **after review, never automatically.** Admin → Catalogue → "Genres waiting for a decision" lists words that matched no genre, most common first. Keep one by adding a rule or a genre in `src/genres.js`, then deploy.
- [x] Scroll audit of every panel (desktop, small laptop, phone): nothing cut off, no scroll inside scroll; Search and History now scroll their list, not the whole panel.
- [x] New History icon.

## 8 · Promote panel
- [x] Four numbered steps; "Your promotions" window; `?promo=now`.
- [x] Change a running campaign's look: 🎨 Look in "Your promotions" (live preview; free).
- [x] Genre targeting (optional, up to 3): the pop-up only shows while someone plays one of those genres; none = anyone. The pop-up sends the genre of the track on the deck. Admin free promotions can target too.
- [ ] Promoting a whole mix: decided no for now (see 0).
- [ ] Look at the Promote panel on your own screen and say what still feels confusing.

## Before going public (Dan-side) — do these in order
1. [ ] **Deploy the latest zip, then open `https://riffrolled.com/api/health`.** It must say `"schema":30`. If it says a lower number, the new version is not live yet.
2. [ ] **Cloudflare rate limit on `/api/*` (the one real blocker).** Without it, one script could hammer every API route. The admin tool now does this for you:
   1. Close the admin tool if it is open, then start it again (double-click **start-admin.bat**). A dark-orange bar at the top of every page says "⚠ The Cloudflare rate limit on /api/ is not on yet".
   2. Press **Turn it on** in that bar (it opens the **Cloudflare** tab), then press **Turn it on** again in the "Rate limit on /api/" box.
   3. If it says your token can't see rate-limiting rules: go to https://dash.cloudflare.com (sign in yourself) → your profile icon, top right → **My Profile** → **API Tokens** → the token you use for riffrolled → **…** → **Edit**. Under Permissions add a row **Zone · Zone · Read** and another **Zone · Zone WAF · Edit**. Under Zone Resources choose **Include · Specific zone · riffrolled.com**. **Continue to summary** → **Update token**. The token's value does not change, so nothing needs re-entering. Back in the admin tool press **Check again**, then **Turn it on**.
   4. When it is on, the box says "✓ On for riffrolled.com: 30 requests per 10 seconds per visitor, then blocked for 10 seconds" and the orange bar disappears.
   The rule it creates: URI Path starts with `/api/`, 30 requests per 10 seconds per IP, block for 10 seconds (the free plan allows exactly one rule, and 10 seconds is its only period). If real listeners get blocked later, raise 30 to 60 in the dashboard. Many people on one shared network (a school, an office) count as one IP.
   *If you would rather click it yourself:* riffrolled.com → **Security** → **WAF** → **Rate limiting rules** → **Create rate limiting rule**; name `api-limit`; Field **URI Path**, Operator **starts with**, Value `/api/`; characteristics **IP**; **30** per **10 seconds**; action **Block**, duration **10 seconds**; **Deploy**.
3. [ ] **First-deploy settings.** `CONTRIB_POOL_PER_EPOCH` already defaults to 0 (rewards off), so leave it. Optional: stop difficulty auto-adjusting while there are almost no users. Open `wrangler.toml`, find the line `# MINE_TARGET_PER_HOUR = "60"` in the `[vars]` block, remove the `#` and change it to `MINE_TARGET_PER_HOUR = "0"`, then deploy again. (Turn it back on, i.e. put the `#` back, once real people are mining.)
4. [ ] **Restrict the YouTube API key** (5 minutes). https://console.cloud.google.com → APIs & Services → **Credentials** → click the key riffrolled uses → **API restrictions**: **Restrict key** → tick only **YouTube Data API v3** → **Save**. Leave "Application restrictions" on **None** (the key is used by the Worker, not a browser). It then can't be used for anything else if it ever leaks.
5. [ ] **Make 2 or 3 premade mixes** (and pick a cover for each with "Use as cover") (admin tool → Mixes → the three steps), so the Mixes panel is not empty on day one. Copy each mix's link with the new **Copy link** button and open it in a private window to check it works.
6. [ ] **Run the batch link check** on the catalogue (admin tool), so listeners do not hit dead videos.
7. [ ] **Put a free campaign on a couple of good tracks** (admin → Promotions → "Promote a track for free", pop-up + DJ brief), then open `riffrolled.com/?promo=now` in a private window and see the record appear. (Admin campaigns never wait for review.)
8. [ ] **Quiet launch first.** Send the link to 3 to 5 people, ask them to try the player, Promote and a shared mix link. Watch admin → Activity for a day before telling more people.
9. [ ] Remember in every post and message: riffrolled supplies no music. It all plays from YouTube; riffrolled is the player and discovery layer.

## 30 Oct: whole channels
- [x] **Every track now records the YouTube channel that uploaded it.** It comes free with every YouTube answer (searches, imports, the grower); the 30-day refresh fills it in for older tracks.
- [x] **Channels become candidates by themselves** (`src/channels.js`, hourly). Once a day the site counts how each channel's tracks do here (tracks, likes, plays); YouTube's own facts about each — subscribers, video count, topic labels like "Electronic music" — cost 1 unit per 50 channels and are refreshed every 25 days. "Artist – Topic" channels (only songs) approve themselves once 3 of their tracks are liked here (`CHANNEL_AUTO_TOPIC`, `CHANNEL_AUTO_LIKES`); everything else waits for you.
- [x] **Admin → Channels**: candidates best first (likes and plays here, tracks here, Topic, subscribers), with Approve / Reject, a filter for Approved / Rejected, and **Add channel** (paste a youtube.com/@name or /channel/ link; the site looks it up within the hour for 1 unit).
- [x] **Approved channels are imported**: newest first, a few pages per run, up to 1,000 tracks each (`CHANNEL_MAX_TRACKS`), then checked daily for new uploads. Only videos YouTube files under Music (anything song-length from a Topic channel), embeddable, 1–12 minutes, no covers/reactions/loops. Filed under the channel's genre. At most **2,000 quota units a day** (`CHANNEL_UNITS_DAILY`) ≈ 50,000 tracks.
- [x] **New quota split** (of 10,000 a day): listener searches 3,000 · AI track lookups 2,000 (`AI_YT_DAILY` 40 → 20) · grower 1,500 · channels 2,000 · refresh ~250 · ~1,250 spare.
- [x] **One budget of outside requests per hourly run** (`CRON_CALLS`, 45): the refresh, channels and the grower share it and stop cleanly when it runs out, so the free plan's 50-a-run limit is never hit. **On the $5 plan**, set `CRON_CALLS` to 300 and `CHANNEL_PAGES_PER_RUN` to 40 and channels are read much faster.
- [ ] After deploying: `/api/health` → `"schema":34`. The Channels tab fills in over the first day (tracks need their channel first; the refresh does older ones as it goes). Approve a few good ones; check back the next day for "Imported".

## 30 Oct: the 30-day refresh
- [x] **Every track is re-checked with YouTube at least every 25 days** (`src/refresh.js`, the hourly Cron Trigger). It uses videos.list — 50 tracks per call, 1 quota unit — rather than oEmbed (one request per track), so it keeps up however big the catalogue gets: 10,000 tracks ≈ 9 units a day, 300,000 ≈ 250. If the day's quota is gone it checks 20 with oEmbed instead (free).
- [x] **Still there**: marked checked; title and channel refreshed for tracks whose names came from YouTube (search, channel, playlist imports, the grower). Names typed by a person or the AI DJ are left alone.
- [x] **Gone, private or no longer embeddable**: hidden at once (out of the catalogue, auto mixes and shared mixes), and deleted — with its place in any shared mix — when a check a day or more later agrees. If YouTube ever says more than half a batch is gone, three are double-checked with oEmbed first; if oEmbed doesn't agree nothing is touched.
- [x] Admin → Usage: a **30-day refresh** panel (checked in the last 30 days, not checked yet, older than 30 days, hidden). The Privacy page says so too. Settings: `REFRESH_ON`, `REFRESH_DAYS`, `REFRESH_MAX_CALLS`. Schema 33.
- [ ] After deploying: `/api/health` → `"schema":33`. Existing tracks count as "not checked yet" and are worked through first; the panel should reach 100% within a day or two. Then this is the evidence for Google's quota-extension form.
- Not covered: copies of titles inside listeners' own browsers (their playlists). Dead videos there are already removed when they fail to play; if Google's reviewers ask, a light browser-side refresh is the next step.

## 30 Oct: more YouTube links for the same quota
- [x] **Every YouTube search asks for 50 results** (it was 10–25). It costs the same 100 units either way. Listener searches keep all 50 in the catalogue; an AI track lookup keeps the track plus that same artist's other songs from the results (not covers, reactions or loops).
- [x] **The catalogue grower** (`src/grow.js`), run by the hourly Cron Trigger. Auto mixes that come back short put their styles on its list (and any broad genre with fewer than 80 tracks goes on too). Each hour it takes the two most-wanted styles, does one playlist search for each (100 units), reads the best one or two playlists (1 unit per 50 tracks), checks every new video (1 unit per 50: public, embeddable, 1–12 minutes) and adds the good ones, filed under that style. A style waits a week before it's grown again. About 120 units buys up to ~150 new tracks; it spends at most 1,500 units a day (`GROW_UNITS_DAILY`), leaving the rest for listener searches and AI lookups. Settings: `GROW_ON`, `GROW_UNITS_DAILY`, `GROW_STYLES_PER_RUN`, `GROW_TRACKS_PER_STYLE`, `GROW_MIN_GENRE`, `GROW_MAX_MINUTES`. Schema 32.
- [x] Playlist and channel imports now record the real artist (the channel that uploaded each video, "– Topic" removed) instead of whoever made the playlist.
- [x] Admin → Usage has a **Catalogue grower** table: what it's looking for, how often it was asked, tracks added, when it last ran, and today's quota use. Restart the admin tool after copying the new files.
- [ ] After deploying: `/api/health` → `"schema":32`. Within a couple of hours the grower table should show genres being filled.
- [ ] **On the $5 Workers plan** (optional): raise `GROW_STYLES_PER_RUN` to 4 (paid Workers can make far more outside requests per run). The YouTube quota stays 10,000 units a day whatever the plan; Google's free quota-extension form is the way past that (do the 30-day refresh first).

## 30 Oct: auto mixes
- [x] **AUTO is its own mode** in DJ AI, first of three: ✨ AUTO (we make it) · TEXT (copy + paste) · TRACK ROLLED. AUTO is just the style box and ✨ MAKE MY MIX; TEXT → Simple is back to copy/paste only. New visitors start in AUTO; anyone already using TEXT stays there. The tour's first step now makes a real mix (a random broad genre if none is picked) and it starts playing; if none are left today it rolls a brief instead.
- [x] **3 free auto mixes a day** per visitor (was 5). Change it any time: `AUTOMIX_PER_DAY` in the D1 config table. When they run out, the message points to TEXT, which has no limit.
- [x] **✨ MAKE MY MIX** in DJ AI → 🌱 Simple: pick up to three styles, press it, and riffrolled's own AI (Cloudflare Workers AI) makes the mix — no copying to ChatGPT. It picks from the catalogue (up to 120 matching tracks, by genre or by a word in the title/artist), and may add up to 4 new tracks it looks up on YouTube (8 when the catalogue has almost nothing for that style), out of the same daily budget as every AI DJ playlist (`AI_YT_DAILY`, 40 a day). Nothing invented gets in: picks must be from the list, new ones must be found. The mix is saved as a 🤖 playlist, opens in the Playlist window and starts playing. COPY DJ BRIEF is still there for people who use their own AI.
- [x] **Limits**: 3 a day per visitor (was 5), 300 a day for the whole site (inside the free Workers AI allowance of 10,000 neurons a day; one mix is far under 100). A mix that finds nothing isn't counted. Visitors are counted as a one-way hash for two days, like share counts. Settings in the D1 `config` table: `AUTOMIX_ON`, `AUTOMIX_PER_DAY`, `AUTOMIX_DAILY`, `AUTOMIX_NEW`.
- [x] **Full-length mixes (30 Oct fix)**: the first version let the AI stop early (a test mix came back with 9). Now it's asked for all of them, and if it still stops short the mix is topped up from the closest matches it left out — tracks with a word of the request in their own genre, title or artist first, then the broad genre. New finds take the place of top-ups. If the catalogue simply doesn't have enough, the status line says "riffrolled only has N tracks for … so far".
- [x] **No AI, still a mix**: if the AI is unavailable or answers nonsense, it uses the best-liked matching tracks and says "picked from the best-liked matches".
- [x] Privacy page: a paragraph on auto mixes (only the styles are sent; Cloudflare runs the AI). Admin → Usage counts "Auto mixes made". Schema 31.
- [ ] **After deploying**: `/api/health` should say `"schema":31`. Then open DJ AI → Simple, pick a style, press ✨ MAKE MY MIX. Nothing to set up in Cloudflare: the AI comes with the deploy (`[ai]` in wrangler.toml). If the status line says "picked from the best-liked matches" every time, the AI isn't reachable: tell me and I'll check the Worker logs with you.
- [ ] **The catalogue is the limit.** A style riffrolled has few tracks for gives a short mix (it says so). Importing a few channels or playlists per genre makes every auto mix better, and every new track an auto mix finds is kept.

## 28 Oct, part 2
- [x] **Live**: `/api/health` says build 20261028073518-542179, schema 30. Cloudflare rate limit turned on by Dan.
- [ ] **Check the rate limit works**: in PowerShell run `1..40 | % { try { (Invoke-WebRequest "https://riffrolled.com/api/health?rl=$_" -UseBasicParsing).StatusCode } catch { $_.Exception.Response.StatusCode.value__ } }` — about 30 × `200`, then `429`. (Your own address is blocked for 10 s afterwards; harmless.) Blocks also show under riffrolled.com → Security → Events.
- [x] **Playlist windows are all the same.** ⧉ New window (in any Playlist window) opens another identical window, beside it, on a new empty playlist ("New playlist 2"…) with the name ready to type. Each window has everything: ＋ New playlist, ⧉ New window, Share, find/switch, rename, ▾, ☑ Select, mini transport, drag to reorder, ℹ, ✕, right-click. Any window can switch to any playlist, even one open in another window. One queue: starting a track in a window makes it the playing playlist. Adding tracks (Tracks, Search, DJ AI lists, promoted cards) goes into the window you last clicked in. Computer only; phones keep one window. Hovering the dock's Playlist button lists every window, the first one always (open, minimized or closed — a click brings it back), and the first window comes back on the playlist it showed last time.

## 28 Oct round
- [x] ~~First: get Cloudflare building again.~~ Done — it built.
- [x] **DJ AI**: Your AI and Riffroll It are hidden. Text has a new **🌱 Simple** mode (the default for new visitors): "What kind of music?" — type and pick from 556 styles (each tied to one of the broad genres), or use your own words, up to three — then COPY DJ BRIEF and paste the answer back. One-shot and the Riffenator are unchanged.
- [x] **Genres**: the 32 broad genres stay (they sort the catalogue, target promotions and fill the GENRE line); Simple's search covers far more styles, each mapped to a broad genre.
- [x] **Playlist window**: a menu bar above the search with **＋ New playlist** (an empty one, named "New playlist", "New playlist 2"…, ready to rename), **⧉ New window** (another playlist, or a new empty one, in its own window — computer only) and **Share**. The name row is just the name and ▾.
- [x] **Right-click a track** (computer): Play, Track info, New mix from this track (DJ AI → Track Rolled with it as the seed), Copy link, Remove from this playlist — and "New playlist from the N selected" when it's part of a selection.
- [x] **Shift + drag** sweeps a run of tracks; with ☑ Select on, any drag adds a run.
- [x] **Scrollbars** in the playlist lists.
- [x] **History → Links**: the links you sent (with plays for playlists sent as a link) and the ones you opened from others; copy, open, remove. In this browser only.
- [x] **Keeping your data**: the site asks the browser to keep its storage (persistent storage) once there's something worth keeping; after 14 days without a backup a note offers **Export a backup** (or **Later**, a week); About → Your data shows the last backup and whether the browser keeps it.
- [x] **Backups now include everything**: likes, plays, artists/genres/tags, the links log and ad history (they used to hold only names and playlists). Restoring merges and never doubles.

## 26 Oct round
- [x] **Promote: hole or no hole.** "Hole in the middle?" under the picture size: Hole / No hole, both live records. Also in 🎨 Look and in the admin form (with its preview). Record only. Schema 30.
- [x] **Trance is a genre** on the closed list (it used to be filed under Electronic, which is why "trance" came out wrong). Tracks that came in as trance move back automatically, on the server (schema 30) and in each browser. Campaigns targeting Electronic no longer show while Trance plays: target Trance too if you want both.
- [x] **DJ AI "Where should we go?"**: Trance is now a choice, and a new **Stay in this genre** tick (on by default) tells the DJ most tracks must clearly be that genre. Untick it for the old "starting point, then wander". A "trance" you typed yourself earlier becomes the built-in one.
- [x] **What the AI is told about your taste**: only your 10 / 15 / 20 most-liked tracks (you pick, 15 by default), listed in full under "Share your track data". No plays, history, tags or library list any more.
- [x] **Usage counting** (your own, anonymous): daily totals of a fixed list of things (visits, phone vs computer, first visits, panels opened, plays, likes, DJ briefs copied/imported, playlists made, links/mixes shared, searches, tokens mined, promoted cards shown/played/added/closed/reported). No ids, cookies, devices or times. A one-time note on the page says so; Privacy has a switch to turn it off; browsers sending Global Privacy Control start with it off. **Admin → Usage** shows today / 7 days / 30 days and a per-day chart. Terms and Privacy updated (26 Oct).
- [x] **Sharing a playlist is one press**: SHARE (on the deck or the Playlist window's share button) → **Send this playlist** → the link is copied (phone: the share sheet) and shown with Copy again. Links work straight away, no approval wait, any length. The same playlist with the same tracks reuses its link. **Share to Community…** still uses the form and a key's first one still waits for your OK. The menu now shows which playlist it is about, always fits on screen and never covers the player (the cut-off menu in your screenshot), and Esc closes only the menu.
- [x] **Playlist windows, easier to find**: **☑ Select** in every playlist window (click tracks to pick, then make a playlist; Shift + click / Shift + ↓ still work) and **⧉** next to the playlist name opens another playlist in its own window beside it (computer only). New ad cards wait while you're picking tracks.
- [ ] After deploying, open the site on your phone once: the usage note should appear at the top, and picking tracks should work with ☑ Select or by holding a track.

## Playlist window: pick several tracks (22 Oct)
- [x] **Shift + ↓ / ↑** selects a run of tracks (starting from the playing track if it is in the list, else the top); **Shift + click** stretches the run; **Ctrl + click** (⌘ on a Mac) adds or removes one. Nothing plays while selecting; a plain click still plays.
- [x] A bar shows "N tracks · New playlist from these". **Enter** (or the button) asks for a name with a suggestion ("From Night Drive · 4 tracks"); Enter again makes it, in list order. You stay where you were, the music carries on, and a banner offers **Open it**. **Esc** clears.
- [x] Works in every playlist window: the main one and each extra (⧉) window. The keys go to the window you last clicked in, while it is open and no text box has the keyboard. From an extra window, **Open it** shows the new playlist in the main window.
- [x] **Phones**: hold a track to start picking (it gets a ● tick, the others ○); then taps add or remove tracks instead of playing them; the bar's buttons (big enough to tap) name and make it; ✕ stops picking.

## What the server keeps (22 Oct)
- [x] The server now keeps only: the shared track catalogue (with anonymous play/like counts), shared mixes, and the credit economy (wallets, mining, promotions). Your listeners' playlists, history, likes, links between tracks and ad history live in their browser (Dexie).
- [x] Removed (schema 29): the server's anonymous copy of every DJ AI set (the tracks still join the catalogue) and the unused track-to-track links table. Recoverable for 7 days with D1 Time Travel if you change your mind.
- [x] Privacy page corrected: it said only promoted plays were counted; it now says the page sends anonymous play/like tallies per track, and that a DJ set's tracks join the catalogue but the set itself stays in the browser.
- [ ] Contribution rewards are still in the code, switched off (`CONTRIB_POOL_PER_EPOCH = 0`), and store nothing while off. Say if you want them removed completely.

## Promoted cards, round 2 (22 Oct)
- [x] **Picture size per campaign**: Promote window → "How much picture?" — More vinyl / Balanced / More picture, each a live little record. Record only (the poster has none). Changeable later with 🎨 Look. Needs schema 28.
- [x] **Up to 5 cards on screen** (1 on a phone). A new one every 5 minutes; each stays until the listener closes it. With 5 up, the new one replaces the oldest, in its spot and at its size — but never the one under the pointer. Up to 12 new cards per visit (was 6), since they now stay.
- [x] **Drag and resize** (computer): drag from anywhere on the card, resize from the corner grip (70%–160%). Dropped on the YouTube player or the record player, it slides to the nearest clear spot. New cards also try to keep off open windows. Spots and sizes are remembered between visits (Dexie, this browser only).
- [x] **History → Ads**: the last 20 cards shown, newest first, in Dexie only. ▶ and ＋ count a play for the campaign (never a credit); ✕ removes one.
- [x] **Admin preview**: "How should the pop-up look?" now shows the site's real card beside the choices (style, picture size, color), with the track's picture.
- [x] Fixed: History's "Your DJ sets" header showed under the other tabs.
- [ ] Try it: open `riffrolled.com/?promo=now` a few times with a couple of free campaigns running, drag one, resize one, reload.

## Safety and security (22 Oct pass)
- [x] **Rate limit**: the admin tool checks for the rule and creates it with your own token (step 2 above). It never replaces a rule you already have; if a different rule is in the one free slot it tells you instead.
- [x] **A looping pop-up can't drain a campaign any more**: each person (a hash of their address, never the address) is charged once per campaign per `PROMO_REPEAT_HOURS` (6). After that they are shown nothing. Kept 7 days, then swept.
- [x] **New promoters wait for your OK**: a key's first campaign is paid for but held until you approve that key. Admin → Promotions → **Waiting for your OK**: *OK this one*, *OK this key* (the same approval as mix sharing, so later campaigns go straight up), *End + refund*, *End*. A blocked key cannot promote. Turn it off with `PROMO_REVIEW = false`.
- [x] **⚑ Report on the promoted card** (press twice to confirm). One report per person per campaign; `PROMO_REPORTS_TO_HOLD` (3) different people put it on hold, credits kept, and it appears in Waiting for your OK. Its owner can't resume out of a hold.
- [x] **Daily cap on YouTube searches** from the search box: `SEARCH_YT_DAILY` (30 a day for the whole site; 0 = catalogue only). After that the catalogue answers and the listener is told why. Protects your YouTube quota.
- [x] **Shared track links (`?t=`) ask first** ("Add it") instead of adding straight to the listener's playlist.
- [x] **Terms**: credits have no cash value, can't be bought, sold or exchanged, and can be removed for abuse; promotion and sharing rules; the YouTube search allowance. **Privacy**: shared-by is opt-in, link-only mixes are unlisted (anyone with the link can open them, they are not private), counting uses a one-way hash, the genre of the playing track is sent when asking for a promotion.
- [ ] **Your Cloudflare token**: keep it to what the admin tool needs: Account · D1 · Edit, Account · Workers Scripts · Edit, Zone · Zone · Read, Zone · Zone WAF · Edit (riffrolled.com only). If your laptop is ever lost or stolen, delete the token at dash.cloudflare.com → My Profile → API Tokens, and the GitHub one at github.com → Settings → Developer settings → Fine-grained tokens. Both live only in `C:\Users\Dan\.riffrolled-admin.json`.
- [ ] **Private keys can't be recovered.** Nobody, you included, can get a listener's credits back if they lose their key. The 🔑 Your keys panel already tells them to save it; worth saying again in launch posts.
- [ ] **If the database is ever damaged** (a bad delete, a bad migration): D1 keeps a 7-day history on the free plan (30 on paid). In a Command Prompt in the project folder: `npx wrangler d1 time-travel info riffrolled` shows where you are; `npx wrangler d1 time-travel restore riffrolled --timestamp=2026-10-22T09:00:00Z` (a time before the damage, in UTC) puts it back. The restore replaces everything after that time, so note down anything new first. Use the database name from `wrangler.toml`.
- [x] **YouTube's 30-day rule** — built 30 Oct (see "30 Oct: the 30-day refresh" above).
- [ ] **Fake wallets (Sybil)**: one person can make many keys. What limits it today: mining is slow and capped per day, contributions have a 5-minute cooldown and rewards are off (`CONTRIB_POOL_PER_EPOCH = 0`), sharing and promoting wait for your OK, and a promoter is never charged for their own pop-up. Keep rewards off until you see real use.

## Later / parked
- [ ] Sync playlists to another device with the same private key.
- [ ] Bandcamp embeds alongside YouTube (spike first).
- [ ] Phone: a skin button.
- [ ] Phone: small docked player while browsing other tabs (must stay at least 200×200).
- [ ] Phone-friendly pass on DJ AI (44px tap targets, bigger text).

## Done
- [x] **Poster or record, and a color, per campaign.** Promote window step 2: pick Record or Poster from two live tiles, pick one of nine colors (Classic, Neon, Hot pink, Sunset, Gold, Toxic, Ice, Violet, Mono) or any color with the free picker, and check it in "What listeners will see". Stored on the campaign (needs schema 25: check `/api/health` says `"schema":25` after deploying) and shown on each row of "Your promotions". The Promoted tag stays gold whatever the color. Admin tool: same choice on the free-promotion form (record by default), and the table shows each campaign's look.
- [x] **Promoted card stays up a full minute** (was 25 s), or until the listener clicks ✕ / presses Escape / uses Play or Add. Holding the pointer on it keeps it; it lingers 8 s after the pointer leaves, never less than the minute.
- [x] **Preview of the ad in the Promote window**: step 2 now has "What listeners will see", the real record card (your track's picture as its label, your campaign name as the title, hover for Play / Add / Close, the Promoted tag). Preview only: nothing is shown to anyone and no credits are used.
- [x] A promoter is never shown (or charged for) their own campaign: pop-up, DJ briefs and claims all leave your own wallet's campaigns out, and your own plays/likes on it aren't counted. To test a paid campaign, use a second browser profile (or another private key); admin free campaigns still show to you.
- [x] Free test promotions from the admin tool; Promotions tab rewritten for credits (it was still counting hours).
- [x] Fixed an old stylesheet bug that left the "Your promotions" list unstyled.
- [x] Menus no longer appear under the record player.
- [x] **The promoted ad is the spinning record again**, with the video's picture as the round label (this is what other listeners see). "Promoted" tag always visible below it; Play / Add / Close appear on hover (always on touch screens); the title sits above. The gig-flyer poster is now only the artwork at the top of the Promote panel.
- [x] DJ AI first in the dock; One-shot prompt and **The Riffenator 🤖🎸** (full vocabulary); Track Rolled Journey; Link Hunter pop-up wizard; prompts ask for bare video IDs.
- [x] "🌍 Share with community" with per-wallet limits, 10-at-a-time community list and search.
- [x] **Share approval**: every wallet starts at sharing:false; first shares wait in admin → Mixes → "Waiting for your OK" (schema 23).
- [x] Public / private wallet keys (schema 21), 🔑 Your keys in the Mine panel.
- [x] Mix details show the track list and the DJ AI choices; admin builds mixes from the brief.
- [x] Contact address hello@riffrolled.com (About, Terms, Privacy, Promote panel).
