# riffrolled — checklist

Dan's running to-do list. `[ ]` open, `[x]` done. Bandcamp is parked on purpose.

## Just fixed
- [x] Promote is now the gig-flyer poster (your artwork, background cut out, 13 KB) pinned near the bottom right, just above About. Smaller on short windows; a "Promo" tab on phones.
- [x] Menus appeared *under* the record player. Panels and menus can now sit on top of the record player's body; only the YouTube video stays above them (YouTube's "never covered" rule). Phones unchanged.

## Mixes
- [ ] Shareable playlist links (riffrolled.com/?m=<random code>) — see the notes on the dangers before building.
- [x] Mix details show the track list and the DJ AI choices that made it (schema 20; the admin builds a mix from the brief and saves them; listeners can opt in to share theirs).
- [x] Admin: the same DJ choices as the site, prompt 1 (DJ brief, changes with the choices) and prompt 2 (The Track Check).
- [ ] Actually finish the Mixes tile: create our premade mixes (use the admin Mixes tab; paste-a-list builder).
- [ ] Set up community mode (opt-in Share, daily limit, report-to-hide) and decide the settings before switching it on.
- [ ] Move "Random Mix" in here, under Mixes, instead of its own dock button.
- [ ] Optional: let a premade mix have a cover picture (pick one of its track thumbnails). Needs a new migration (21); deploy first.

## Playlists
- [ ] Do something with the playlist menu (it needs a proper design pass).
- [ ] Drop-down menu next to the name input (pick / switch playlist).
- [ ] LATER (parked): multiple playlist windows? Only one can be playing at a time. Undecided: several windows vs one window with a switcher.

## Search
- [ ] Search "does nothing" — reproduce, find out why, fix.

## Genres / tags
- [ ] Do we need more genres? Decide a rule for when someone adds a new genre: does it join the shared list automatically, or only after review?

## All windows
- [ ] Scroll bars (vertical) in most windows — audit every panel and give long ones a scrolling body.

## DJ AI
- [x] Admin has the two paste prompts (DJ brief, then The Track Check).
- [x] DJ AI modes are now One-shot prompt (Dan's one-shot prompt) and Multi-shot prompts, a pop-up wizard (DJ brief → track list → Link Hunter → import), the same prompts as the admin.
- [x] Multi-shot is now **The Riffenator 🤖🎸**, marked BETTER, with the full Riffenator vocabulary (≈230 options with describing words and personality one-liners).
- [x] DJ AI is first in the dock / tab bar.
- [x] DJ AI "🌍 Share with community" (opt-in): shares the finished set; creator's public key logged (admin-only); per-wallet daily limit; admin "Hide all by creator".
- [x] Community: 10 newest / popular at a time; search by name, artist, track and DJ choices.
- [x] Share approval: every wallet starts at sharing:false; its shares wait in admin → Mixes → "Waiting for your OK" until you approve the key (then sharing:true and it goes straight up). Reject / Block / Revoke there too. Needs schema 23 deployed.
- [x] Track Rolled Journey: a DJ AI mode seeded with up to five of your tracks (plus "Roll a journey from this track" in Track info).
- [x] Prompts ask for bare video IDs (Gemini mangles URLs); the importer takes IDs, URLs or Google redirect links.
- [x] Any reply that isn't a full playlist pops up Link Hunter for the missing tracks; found tracks go back in their own places.

## Icons
- [ ] New History icon.
- [x] New Promote icon: a tilted, torn gig flyer with a starburst and a music note (gold accent).
- [x] Contact address hello@riffrolled.com added (About, Terms, Privacy, Promote panel).

## Promote menu
- [ ] Decide what to fix first: too long / confusing credits / no results view. Then the wizard + genre targeting.

## Accounts
- [x] Public / private wallet keys (schema 21): the server only stores public keys; existing wallets move over on next visit. 🔑 Your keys in the Mine panel.
- [ ] Later: sync playlists to another device with the same private key (today only the wallet travels; the Your data backup carries playlists).

## Before going public (Dan-side)
- [ ] WAF rate limiting on `/api/*` (Cloudflare).
- [ ] First deploy settings: `MINE_TARGET_PER_HOUR=0`, `CONTRIB_POOL_PER_EPOCH=0`.
- [ ] Batch link checks.

## Later
- [ ] Bandcamp embeds alongside YouTube (spike first). Parked.
- [ ] Phone: a skin button.
- [ ] Phone: small docked player while browsing other tabs (must stay at least 200×200).
