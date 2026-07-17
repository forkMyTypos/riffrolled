// ── YouTube Data API v3 client (minimal) ──────────────────────────────
// The ONLY module that talks to YouTube. Reads env.YT_API_KEY (a Worker
// Secret); the key never leaves the Worker. One search.list call per
// cache miss — no videos.list hydration, since our schema doesn't need it.

const API_BASE = 'https://www.googleapis.com/youtube/v3';

/** Error with a machine-readable kind: 'quota' | 'rate_limit' | 'config' | 'upstream'. */
export class YouTubeError extends Error {
  constructor(message, kind, status = 502) {
    super(message);
    this.name = 'YouTubeError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Search YouTube; returns rows in our tracks shape:
 *   { name, artist, genre, url }
 * name = video title, artist = channel title (best available guess),
 * genre = '' (user fills in later), url = full watch URL.
 */
export async function searchYouTube(env, query, limit = 15) {
  if (!env.YT_API_KEY) {
    throw new YouTubeError('YT_API_KEY secret is not configured', 'config', 500);
  }
  const url = new URL(`${API_BASE}/search`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('videoCategoryId', '10'); // Music; remove to search all categories
  url.searchParams.set('maxResults', String(Math.min(Math.max(limit, 1), 25)));
  url.searchParams.set('q', query);
  url.searchParams.set('key', env.YT_API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) {
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

  const data = await res.json();
  return (data.items || [])
    .filter((it) => it?.id?.videoId)
    .map((it) => ({
      name: it.snippet?.title || '',
      artist: it.snippet?.channelTitle || '',
      genre: '',
      url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
    }));
}
