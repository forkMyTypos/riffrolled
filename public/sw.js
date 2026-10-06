/* riffrolled — sw.js
   A service worker with exactly one job: receive text shared to riffrolled
   from the operating system (Android's share sheet) and hand it to the page.

   It deliberately does NOT cache anything. An offline cache would mean
   people running yesterday's riffrolled after a deploy, and silently
   serving stale JavaScript is a far worse bug than not working on a train.
   There is no `fetch` handler for anything other than the share target, so
   every normal request goes to the network exactly as it would without a
   service worker at all.

   The flow, which is the standard one because POST navigations cannot be
   read by a page:

     share sheet → POST /share-target → (this worker intercepts)
       → stash the text → 303 redirect to /?shared=1
       → page starts, asks for the stash, imports it

   The stash is a Cache entry rather than IndexedDB: a service worker can
   write it without waiting on Dexie, and it survives the redirect. */

const STASH = 'riffrolled-share';
const SLOT = '/__shared__';

self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return;

  event.respondWith((async () => {
    let text = '';
    try {
      const form = await event.request.formData();
      // Different apps put the body in different fields: a plain text
      // selection arrives as `text`, while some send it as `title` with a
      // `url` alongside. Keep whichever is longest — the reply is the
      // longest thing in a share by a wide margin.
      text = [form.get('text'), form.get('title'), form.get('url')]
        .map((v) => (v == null ? '' : String(v)))
        .sort((a, b) => b.length - a.length)[0] || '';
    } catch (e) { /* a share we can't read is a share we ignore */ }

    if (text) {
      const cache = await caches.open(STASH);
      await cache.put(SLOT, new Response(text, {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }));
    }
    return Response.redirect('/?shared=1', 303);
  })());
});

/* The page asks for the stash once it has started, and we clear it on the
   way out so a share is imported exactly once. */
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'riffrolled:take-share') return;
  event.waitUntil((async () => {
    let text = '';
    try {
      const cache = await caches.open(STASH);
      const hit = await cache.match(SLOT);
      if (hit) { text = await hit.text(); await cache.delete(SLOT); }
    } catch (e) { /* nothing to hand over */ }
    (event.source ? [event.source] : await self.clients.matchAll())
      .forEach((c) => c.postMessage({ type: 'riffrolled:share', text }));
  })());
});
