# riffrolled — checklist

Dan's running to-do list. `[ ]` open, `[x]` done. Bandcamp is parked on purpose.

## Just fixed
- [x] Menus appeared *under* the record player. Panels and menus can now sit on top of the record player's body; only the YouTube video stays above them (YouTube's "never covered" rule). Phones unchanged.

## Mixes
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
- [ ] Bring the same two-prompt flow into the DJ AI panel on riffrolled.com (it still uses its one-prompt version).

## Icons
- [ ] New History icon.
- [x] New Promote icon: a tilted, torn gig flyer with a starburst and a music note (gold accent).
- [x] Contact address hello@riffrolled.com added (About, Terms, Privacy, Promote panel).

## Promote menu
- [ ] Decide what to fix first: too long / confusing credits / no results view. Then the wizard + genre targeting.

## Before going public (Dan-side)
- [ ] WAF rate limiting on `/api/*` (Cloudflare).
- [ ] First deploy settings: `MINE_TARGET_PER_HOUR=0`, `CONTRIB_POOL_PER_EPOCH=0`.
- [ ] Batch link checks.

## Later
- [ ] Bandcamp embeds alongside YouTube (spike first). Parked.
- [ ] Phone: a skin button.
- [ ] Phone: small docked player while browsing other tabs (must stay at least 200×200).
