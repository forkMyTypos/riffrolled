# riffrolled — YouTube API review readiness

Checked 17 Nov 2026 against YouTube's Developer Policies and Required Minimum
Functionality. Not legal advice; it's a working checklist.

## Where riffrolled stands

| Rule | Status | How |
|---|---|---|
| Player at least 200 × 200 px | ✅ | `.screen` is fixed at 200 × 200 (`deck.css`); `ytGuard` warns if it ever shrinks |
| Nothing over the player | ✅ | Deck laid out around the video; floating cards ask `ytGuard` first and an audit runs every couple of seconds |
| No background player (not on the screen the user is viewing) | ✅ **fixed this round** | Phone: the video stays pinned at the top of every tab once a track is loaded (`mobile.css`). Any device: playback pauses when the tab is hidden and carries on when it's back (`bgGuard` in `player.js`) |
| No autoplay unless the player is visible | ✅ | Follows from the two rows above |
| Player not modified; YouTube links in it not hidden | ✅ | Plain IFrame API, standard `playerVars` only |
| HTTP Referer sent | ✅ | `Referrer-Policy: strict-origin-when-cross-origin` (`_headers`); no `noreferrer` on YouTube links |
| Terms: link to YouTube ToS, "agree to be bound by" | ✅ **fixed this round** | Terms and Privacy both say it, with the link |
| Privacy: says it uses YouTube API Services, links Google Privacy Policy | ✅ **fixed this round** | First paragraph of the Privacy Policy |
| Privacy: cookies, third-party content and ads, what's collected, contact | ✅ | Cookies (YouTube's player), promoted cards from other listeners, the full data list, `hello@riffrolled.com` |
| Policies at a stable address, always reachable | ✅ **new** | https://riffrolled.com/terms and https://riffrolled.com/privacy, plus About & Legal in the app |
| Stored YouTube data refreshed or deleted within 30 days | ✅ | `src/refresh.js` re-checks every track within 25 days (titles, channel, length); gone videos are removed |
| Deletion requests answered within 7 days | ✅ | Stated in the Privacy Policy; nearly everything personal is in the listener's own browser |
| No Google sign-in, so no "Authorized Data" or revoke rules | ✅ n/a | riffrolled never touches anyone's YouTube account |
| YouTube shown as the source | ✅ | YouTube's own player and logo on every play; About says playback is YouTube's |
| Search results from other sources not presented as YouTube results | ✅ | Links found via Discogs, Brave, Serper etc. are only used after YouTube's own oEmbed confirms the video; nothing is shown as "YouTube search results" |
| "Made for Kids" videos: look up status, turn off tracking | ⚠️ open | riffrolled tracks no one (no identifiers, no ads tracking, anonymous play tallies only), which is the answer to give. To be thorough later: read `status.madeForKids` in the 30-day refresh and skip the anonymous play tally for those videos |

## Before applying (Dan)

1. **Make sure `hello@riffrolled.com` really receives mail.** Cloudflare dashboard → riffrolled.com → Email → Email Routing → Get started → add the address and forward it to your own inbox. Reviewers may write to it.
2. Deploy this version and open https://riffrolled.com/privacy and https://riffrolled.com/terms once to see them.
3. Only apply when you actually need more quota: when the AI tab shows YouTube search regularly hitting its daily limit. Have the numbers ready (units used per day, what for).
4. The form: in Google Cloud Console, open the YouTube Data API v3 quotas page and follow the link to the quota extension / audit form. They ask for the site URL, the Terms and Privacy URLs, how the API is used, and often a short screen recording of the site in use.

## The one product trade-off

Pausing when the tab is hidden means music stops if you switch tabs or lock the phone. That is the strict reading of "not displayed in the page, tab, or screen that the user is viewing". To allow background listening anyway, set `bgGuard.ON = false` in `public/js/player.js`, but expect the review to object.
