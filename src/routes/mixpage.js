// ── GET /mix/<code> ────────────────────────────────────────────────────
// A shared mix's own address. The page is the ordinary riffrolled page
// (index.html from the static files) with two changes made on the way out:
//
//   1. Link previews. X, Discord, iMessage, WhatsApp, Slack and Facebook read
//      <meta property="og:…"> / <meta name="twitter:…"> from the HTML they
//      fetch, and none of them run JavaScript, so the mix's name and a few of
//      its tracks are written into the HTML here, from the database.
//   2. <base href="/">. index.html loads css/…, js/…, img/… by relative
//      path, which at /mix/<code> would mean /mix/css/…; the base tag points
//      them back at the site root. The page's security policy normally
//      forbids a base tag (base-uri 'none'); for this page only it allows the
//      site itself (base-uri 'self').
//
// The page then opens the mix itself (mixes.js reads /mix/<code>) and tidies
// the address back to "/" so a reload doesn't reopen it.
//
// /p/<code> and /playlist/<code> are redirected here, as are lower/upper
// case variants. Old links, riffrolled.com/?m=<code>, still work: they are
// the static page, opened by mixes.js as before (without a rich preview).

import { SLUG_RE } from '../slug.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

const SITE_TITLE = 'riffrolled — a turntable for YouTube music';
const SITE_DESC = 'Spin YouTube music on a virtual turntable: build playlists, share mixes, or let DJ AI make one for your mood.';

/** What the preview says for a mix (or the site, when the code isn't a live mix). */
export async function mixPreview(env, slug) {
  if (!SLUG_RE.test(slug)) return null;
  const m = await env.DB.prepare(
    `SELECT id, name FROM mixes WHERE slug = ?1 AND hidden = 0 AND pending = 0`
  ).bind(slug).first();
  if (!m) return null;
  const { results } = await env.DB.prepare(
    `SELECT t.name, t.artist FROM mix_tracks mt JOIN tracks t ON t.id = mt.track_id
      WHERE mt.mix_id = ?1 AND t.gone_at = '' ORDER BY mt.position`
  ).bind(m.id).all();
  const rows = results || [];
  const n = rows.length;
  const named = rows.slice(0, 3).map((t) => clip(t.artist ? `${t.artist} – ${t.name}` : t.name, 60)).filter(Boolean);
  const more = n - named.length;
  const list = named.join(' · ') + (more > 0 ? ` and ${more} more` : '');
  return {
    title: clip(m.name, 80) + ' — a mix on riffrolled',
    description: (n ? `${n} track${n === 1 ? '' : 's'}${list ? ': ' + list : ''}. ` : '') + 'Press play on riffrolled.com.',
    tracks: n,
  };
}

/** The meta tags for a preview. */
export function previewTags(origin, url, p) {
  const image = origin + '/img/og-card.png';
  const title = p ? p.title : SITE_TITLE;
  const desc = p ? p.description : SITE_DESC;
  const tags = [
    ['name', 'description', desc],
    ['property', 'og:site_name', 'riffrolled'],
    ['property', 'og:type', p ? 'music.playlist' : 'website'],
    ['property', 'og:title', title],
    ['property', 'og:description', desc],
    ['property', 'og:url', url],
    ['property', 'og:image', image],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['property', 'og:image:alt', 'riffrolled — a record on a turntable'],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', desc],
    ['name', 'twitter:image', image],
    ['name', 'theme-color', '#0b0b17'],
  ];
  return { title, html: tags.map(([k, n, v]) => `<meta ${k}="${n}" content="${esc(v)}">`).join('\n')
    + `\n<link rel="canonical" href="${esc(url)}">` };
}

export async function handleMixPage(request, env, url, match) {
  const raw = decodeURIComponent(match[2] || '');
  const slug = raw.toLowerCase();
  // one address per mix: /p/…, /playlist/…, upper case and a trailing slash all go to /mix/<code>
  if (match[1] !== 'mix' || raw !== slug || url.pathname.endsWith('/')) {
    return Response.redirect(url.origin + '/mix/' + encodeURIComponent(slug), 301);
  }

  const page = await env.ASSETS.fetch(new Request(url.origin + '/', { headers: request.headers }));
  if (!page.ok) return page;

  let p = null;
  try { p = await mixPreview(env, slug); } catch (e) { p = null; }   // no preview is better than no page
  const { title, html } = previewTags(url.origin, url.origin + '/mix/' + slug, p);

  const out = new HTMLRewriter()
    .on('head', { element(el) { el.prepend('<base href="/">', { html: true }); el.append(html, { html: true }); } })
    .on('head > title', { element(el) { el.setInnerContent(title); } })
    // the page's own default preview tags give way to this mix's
    .on('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"], meta[name="theme-color"], link[rel="canonical"]', {
      element(el) { el.remove(); },
    })
    .transform(page);

  const headers = new Headers(out.headers);
  const csp = headers.get('Content-Security-Policy');
  if (csp) headers.set('Content-Security-Policy', csp.replace(/base-uri\s+'none'/, "base-uri 'self'"));
  headers.set('Cache-Control', 'public, max-age=300');
  headers.delete('ETag');
  return new Response(request.method === 'HEAD' ? null : out.body, { status: 200, headers });
}
