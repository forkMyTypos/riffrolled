# riffrolled — checklist

Dan's running to-do list. `[ ]` open, `[x]` done, `[?]` needs a decision from Dan first. Bandcamp is parked on purpose.

## 0 · Decide first (these change what gets built)
- [?] **Promote vs Share are different things.** Promote = spend riff credits so strangers see a track (the Promote panel and the promoted poster). Share = send a track, playlist or mix to a person. Proposed split: the gig flyer stays the **Promote** dock icon, the poster is the promoted card, and the cassette-and-arrow is the **Share** icon (see 3). Right?
- [?] **Promoting a mix.** Can a whole mix be promoted, or only a single track? (Today a promotion is one track.)
- [?] **5-minute cooldown.** Which actions earn credit today: mining, adding a new verified track, linking two tracks, anything else? Proposal: one credited action per wallet per kind every 5 minutes, enforced on the server. Does a like or a view earn anything?
- [?] **"A reason to bring others."** Options: (a) a referral link that gives both people a few credits once the new person does something real (mines, or adds a verified track); (b) shared mixes show "shared by rr·…" with a play count; (c) credits for plays on your shared mixes. Pick one to start.

## 1 · DJ AI
- [ ] Make the chosen mode obvious: Text vs Track Rolled Journey look almost the same when selected. Stronger selected state (fill + tick + outline), not just a tint.
- [ ] Refine the track-find prompt (Link Hunter): tighter wording, one clear output format, fewer "SEARCH FAILED" replies. Keep the site and the admin tool word-for-word identical (a test enforces it).
- [ ] `public/js/selftest.js` has 3 out-of-date DJ prompt expectations ("time budget stated", "speed template used", "DISCOVERY only when there is something to say"); update them with the prompt work.
- [ ] Add **Grok** next to ChatGPT and Gemini in "open in your AI" (check whether it takes a prefilled `?q=`; if not, copy + open like Gemini).

## 2 · Playlists as windows (desktop only)
- [ ] Hover the Playlist dock icon: a small list of the open playlists, click one to bring it to the front.
- [ ] A minimize button on every playlist window.
- [ ] Close closes the window but the music keeps playing.
- [ ] Only one playlist plays at a time (starting another stops the first; the playing one is marked).
- [ ] Phones keep one playlist window.

## 3 · Share
- [ ] New share icon: your cassette-and-arrow picture (file ready, 6 KB; used for Share, not Promote).
- [ ] Move Share to just after the transport controls (prev, play, next).
- [x] Mixes shareable by link: random code, `riffrolled.com/?m=<code>`; the page opens the Mixes panel on it. (Random, not 1, 2, 3, so people can't browse everything.) Needs schema 24. Link previews in chat apps can't show the mix name (the site is static), they show the generic riffrolled card.
- [ ] Share links for a single playlist (opt-in, same rules).

## 4 · Credits and reasons to come back
- [ ] 5-minute cooldown on every credited action (see 0). Server-enforced, one place in the code, a config key to change it.
- [ ] A reason to bring people to riffrolled (see 0).
- [x] Admin tool: promote tracks of my choosing, to test the whole system. Admin → Promotions → "Promote a track for free": search the catalogue or paste a link, choose pop-up card / DJ brief / both, moods, credits. It's a normal campaign (listeners see "Promoted"), logged in the audit log, and never touches a wallet or the ledger. Pause, add credits, end from the same tab.

## 5 · Your music
- [ ] Liked tracks: a place to see your most liked tracks, in order.
- [ ] Track views / plays per track, kept on your device (Dexie), shown next to likes.

## 6 · Mixes
- [ ] Create our premade mixes (admin tool → Mixes → the three steps).
- [ ] Move "Random Mix" in under Mixes instead of its own dock button.
- [ ] Optional: a cover picture for a premade mix.
- [ ] Deploy, then check `/api/health` says `"schema":24` (share approval = 23, mix link codes = 24).

## 7 · Playlist menu, search, genres, windows
- [ ] Playlist menu needs a proper design pass.
- [ ] Drop-down next to the playlist name input (switch playlist). May be replaced by the open-playlists list in 2.
- [ ] Search "does nothing": reproduce, find out why, fix.
- [ ] Genres: a rule for new genres (auto-join the list or after review).
- [ ] Vertical scroll bars: audit every panel.
- [ ] New History icon.

## 8 · Promote panel
- [x] Redesigned as four numbered steps: pick a track (search shows pictures and artist; "Playing now"; paste a link), where it appears (a picture of each option, with your track in it), moods (only if the DJ option is ticked), credits (quick amounts and a plain "costs / shown to / left after" line).
- [x] "Your promotions" is its own window (opened by a button, and by itself when a campaign starts).
- [x] `riffrolled.com/?promo=now` shows the poster card within a few seconds (it takes a real credit from a real campaign, so use it with a free admin campaign).
- [ ] Genre targeting for promotions (today only moods).
- [ ] Promoting a whole mix (decide in 0).
- [ ] Look at the new Promote panel on your own screen and say what still feels confusing.

## Before going public (Dan-side)
- [ ] WAF rate limiting on `/api/*` (Cloudflare). Matters most for `GET /api/promotions/next`: it needs no sign-in and each call spends a credit, so anyone could loop it and use up a campaign (yours included).
- [ ] First deploy settings: `MINE_TARGET_PER_HOUR=0`, `CONTRIB_POOL_PER_EPOCH=0`.
- [ ] Batch link checks.

## Later / parked
- [ ] Sync playlists to another device with the same private key.
- [ ] Bandcamp embeds alongside YouTube (spike first).
- [ ] Phone: a skin button.
- [ ] Phone: small docked player while browsing other tabs (must stay at least 200×200).
- [ ] Phone-friendly pass on DJ AI (44px tap targets, bigger text).

## Done
- [x] Free test promotions from the admin tool; Promotions tab rewritten for credits (it was still counting hours).
- [x] Fixed an old stylesheet bug that left the "Your promotions" list unstyled.
- [x] Menus no longer appear under the record player.
- [x] The promoted item is now the gig-flyer poster (your artwork, background cut out, 38 KB) at the bottom right, with the track's picture taped on. "Promoted" tag always visible; buttons and title on hover; replaces the spinning record.
- [x] DJ AI first in the dock; One-shot prompt and **The Riffenator 🤖🎸** (full vocabulary); Track Rolled Journey; Link Hunter pop-up wizard; prompts ask for bare video IDs.
- [x] "🌍 Share with community" with per-wallet limits, 10-at-a-time community list and search.
- [x] **Share approval**: every wallet starts at sharing:false; first shares wait in admin → Mixes → "Waiting for your OK" (schema 23).
- [x] Public / private wallet keys (schema 21), 🔑 Your keys in the Mine panel.
- [x] Mix details show the track list and the DJ AI choices; admin builds mixes from the brief.
- [x] Contact address hello@riffrolled.com (About, Terms, Privacy, Promote panel).
