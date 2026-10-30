// ── YouTube Data API v3 client ────────────────────────────────────────
// The ONLY module that talks to YouTube. Reads env.YT_API_KEY (a Worker
// Secret); the key never leaves the Worker.
//
// Quota notes: search.list costs 100 units per call; channels.list and
// playlistItems.list cost 1 unit each. Channel import is therefore ~100x
// cheaper (and faster) than search for bulk-loading tracks.

const API_BASE = 'https://www.googleapis.com/youtube/v3';

/** Error with a machine-readable kind: 'quota' | 'rate_limit' | 'config' | 'upstream' | 'not_found'. */
export class YouTubeError extends Error {
  constructor(message, kind, status = 502) {
    super(message);
    this.name = 'YouTubeError';
    this.kind = kind;
    this.status = status;
  }
}

/** Low-level GET with key injection and quota/rate-limit classification. */
async function ytFetch(env, endpoint, params) {
  if (!env.YT_API_KEY) {
    throw new YouTubeError('YT_API_KEY secret is not configured', 'config', 500);
  }
  const url = new URL(`${API_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', env.YT_API_KEY);

  const res = await fetch(url.toString());
  if (res.ok) return res.json();

  let reason = '';
  try {
    const body = await res.json();
    reason = body?.error?.errors?.[0]?.reason || body?.error?.status || '';
  } catch { /* non-JSON error body */ }
  if (res.status === 403 && /quota/i.test(reason)) {
    throw new YouTubeError('YouTube daily quota exceeded', 'quota', 503);
  }
  if (res.status === 429 || /rateLimit/i.test(reason)) {
    throw new YouTubeError('YouTube rate limit hit — try again shortly', 'rate_limit', 429);
  }
  throw new YouTubeError(`YouTube API error (${res.status} ${reason || 'unknown'})`, 'upstream', 502);
}

const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

/** "Artist - Topic" (YouTube's automatic artist channels) → "Artist" */
export function artistName(channel) {
  return String(channel || '').replace(/\s+-\s+Topic$/i, '').trim();
}

/**
 * Playlists about something ("deep house", "bossa nova"): search.list with
 * type=playlist. 100 units, like any search, but each result can hold
 * hundreds of tracks that cost 1 unit per 50 to read.
 */
export async function searchYouTubePlaylists(env, query, limit = 10) {
  const data = await ytFetch(env, 'search', {
    part: 'snippet',
    type: 'playlist',
    maxResults: String(Math.min(Math.max(limit, 1), 50)),
    q: query,
  });
  return (data.items || [])
    .filter((it) => /^[A-Za-z0-9_-]{10,64}$/.test(it?.id?.playlistId || ''))
    .map((it) => ({ id: it.id.playlistId, title: it.snippet?.title || '', channel: it.snippet?.channelTitle || '' }));
}

/** "PT4M13S" → 253 seconds */
export function isoSeconds(d) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(d || ''));
  if (!m) return 0;
  return (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0));
}

/**
 * What YouTube says about up to 50 videos per call (1 unit per call):
 * Map id → { ok, secs, title, channel }. ok = public and embeddable.
 * Videos YouTube doesn't return (deleted, private) are absent.
 */
export async function videoDetails(env, ids) {
  const out = new Map();
  const list = [...new Set(ids)].filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id));
  for (let i = 0; i < list.length; i += 50) {
    const data = await ytFetch(env, 'videos', { part: 'snippet,status,contentDetails', id: list.slice(i, i + 50).join(','), maxResults: '50' });
    for (const it of data.items || []) {
      const st = it.status || {};
      out.set(it.id, {
        ok: st.embeddable !== false && (st.privacyStatus || 'public') === 'public' && st.uploadStatus !== 'rejected',
        secs: isoSeconds(it.contentDetails?.duration),
        title: it.snippet?.title || '',
        channel: artistName(it.snippet?.channelTitle || ''),
      });
    }
  }
  return out;
}

/**
 * Search YouTube; returns rows in our tracks shape { name, artist, genre, url }.
 * name = video title, artist = channel title, genre = '' (user fills in).
 */
export async function searchYouTube(env, query, limit = 15) {
  const data = await ytFetch(env, 'search', {
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10', // Music; remove to search all categories
    // 50 is the most YouTube returns, and costs the same 100 units as 1
    maxResults: String(Math.min(Math.max(limit, 1), 50)),
    q: query,
  });
  return (data.items || [])
    .filter((it) => /^[A-Za-z0-9_-]{11}$/.test(it?.id?.videoId || ''))
    .map((it) => ({
      name: it.snippet?.title || '',
      artist: it.snippet?.channelTitle || '',
      genre: '',
      url: watchUrl(it.id.videoId),
    }));
}

/**
 * Search for one specific track (AI DJ resolution). Same cost as
 * searchYouTube — 100 units — but asks only for videos that are actually
 * embeddable, so the deck never loads a result it will have to skip.
 */
export async function searchYouTubeTrack(env, query, limit = 6) {
  const data = await ytFetch(env, 'search', {
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',        // Music
    videoEmbeddable: 'true',
    maxResults: String(Math.min(Math.max(limit, 1), 50)),
    q: query,
  });
  return (data.items || [])
    .filter((it) => /^[A-Za-z0-9_-]{11}$/.test(it?.id?.videoId || ''))
    .map((it) => ({
      name: it.snippet?.title || '',
      artist: it.snippet?.channelTitle || '',
      genre: '',
      url: watchUrl(it.id.videoId),
    }));
}

/**
 * Resolve any channel reference — /channel/UC…, a bare UC… id, an @handle,
 * a /user/name URL, or a plain name — to { channelId, title, uploadsPlaylistId }.
 * Tries the cheap lookups (1 unit) before falling back to search (100 units).
 */
export async function resolveChannel(env, input) {
  const s = String(input || '').trim();
  if (!s) throw new YouTubeError('Missing channel input', 'not_found', 400);

  const byId = /(?:channel\/)?(UC[A-Za-z0-9_-]{20,})/.exec(s);
  const byHandle = /@([A-Za-z0-9_.-]{2,})/.exec(s);
  const byUser = /user\/([A-Za-z0-9_.-]{2,})/.exec(s);

  const lookup = async (params) => {
    const data = await ytFetch(env, 'channels', { part: 'snippet,contentDetails', ...params });
    const c = data.items?.[0];
    if (!c) return null;
    return {
      channelId: c.id,
      title: c.snippet?.title || '',
      uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads || '',
    };
  };

  let found = null;
  if (byId) found = await lookup({ id: byId[1] });
  else if (byHandle) found = await lookup({ forHandle: '@' + byHandle[1] });
  else if (byUser) found = await lookup({ forUsername: byUser[1] });

  // Last resort: name search (expensive — only when nothing else matched).
  if (!found) {
    const data = await ytFetch(env, 'search', {
      part: 'snippet', type: 'channel', maxResults: '1', q: s,
    });
    const id = data.items?.[0]?.id?.channelId;
    if (id) found = await lookup({ id });
  }
  if (!found || !found.uploadsPlaylistId) {
    throw new YouTubeError('Channel not found', 'not_found', 404);
  }
  return found;
}

/** Extract a playlist id from a URL or accept a bare id. Mix/radio ids (RD…) aren't fetchable. */
export function parsePlaylistId(input) {
  const s = String(input || '').trim();
  const m = /[?&]list=([A-Za-z0-9_-]{12,})/.exec(s) || /^([A-Za-z0-9_-]{12,})$/.exec(s);
  const id = m ? m[1] : null;
  if (!id) return null;
  if (/^RD/.test(id)) return null;      // autogenerated mix — no stable contents
  return id;
}

/** Playlist title (1 quota unit). Returns '' if the playlist isn't public. */
export async function getPlaylistTitle(env, listId) {
  const data = await ytFetch(env, 'playlists', { part: 'snippet', id: listId });
  return data.items?.[0]?.snippet?.title || '';
}

/**
 * Fetch up to `limit` uploads from a channel's uploads playlist.
 * Cheap (1 unit per 50 videos) and skips private/deleted entries.
 */
export async function fetchChannelUploads(env, uploadsPlaylistId, limit = 50) {
  const cap = Math.min(Math.max(limit, 1), 2000);
  const out = [];
  let pageToken = '';
  while (out.length < cap) {
    const data = await ytFetch(env, 'playlistItems', {
      part: 'snippet',
      playlistId: uploadsPlaylistId,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });
    for (const it of data.items || []) {
      if (out.length >= cap) break;
      const sn = it.snippet || {};
      const vid = sn.resourceId?.videoId;
      if (!/^[A-Za-z0-9_-]{11}$/.test(vid || '') || sn.title === 'Private video' || sn.title === 'Deleted video') continue;
      out.push({
        name: sn.title || '',
        // in a playlist, channelTitle is whoever made the playlist; the
        // artist is the channel that uploaded the video ("Artist - Topic")
        artist: artistName(sn.videoOwnerChannelTitle || sn.channelTitle || ''),
        genre: '',
        url: watchUrl(vid),
      });
    }
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  return out;
}
