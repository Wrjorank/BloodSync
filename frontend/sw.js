// sw.js — the one service worker for every page: makes bloodsync installable (pwa), shows an offline notice
// instead of the browser error page, and receives firebase push messages while no tab is open.
// served from the site root so its scope covers every page; the public firebase config arrives in the query string
const config = Object.fromEntries(new URL(self.location.href).searchParams);
if (config.apiKey) {
    importScripts('/vendor/firebase/firebase-app-compat.js', '/vendor/firebase/firebase-messaging-compat.js');
    firebase.initializeApp({ apiKey: config.apiKey, projectId: config.projectId, messagingSenderId: config.messagingSenderId, appId: config.appId });
    // messages carry a webpush notification block, so the sdk displays them without a custom handler
    firebase.messaging();
}

const OFFLINE = 'bloodsync-offline-v1';
const OFFLINE_ICON = '/assets/icon-192.png';

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(OFFLINE).then(c => c.add(OFFLINE_ICON)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        for (const key of await caches.keys()) if (key !== OFFLINE) await caches.delete(key);
        await self.clients.claim();
    })());
});

// pages and api always come from the network (stock and requests must never be stale);
// only a failed page load is answered, with a notice instead of the browser's dinosaur
self.addEventListener('fetch', (event) => {
    if (event.request.mode !== 'navigate') return;
    event.respondWith(fetch(event.request).catch(() => new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Tidak ada koneksi - BloodSync</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;text-align:center;padding:24px}
img{width:72px;height:72px;border-radius:18px}h1{font-size:20px;margin:20px 0 8px}p{color:#94a3b8;margin:0 0 24px;line-height:1.5}
button{background:#e11d48;color:#fff;border:0;border-radius:12px;padding:12px 20px;font-weight:600;font-size:15px}</style></head>
<body><main><img src="${OFFLINE_ICON}" alt=""><h1>Tidak ada koneksi internet</h1>
<p>BloodSync butuh koneksi untuk menampilkan data stok dan permintaan terbaru.<br>Periksa sinyal atau Wi-Fi, lalu coba lagi.</p>
<button onclick="location.reload()">Coba lagi</button></main></body></html>`, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});

// fcm only opens https links by itself; this covers the rest and reuses an open bloodsync tab
self.addEventListener('notificationclick', (event) => {
    const data = event.notification.data || {};
    const link = data.FCM_MSG?.data?.link || data.link;
    if (!link) return;
    event.notification.close();
    event.waitUntil((async () => {
        const target = new URL(link, self.location.origin);
        const tabs = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        const tab = tabs.find(c => new URL(c.url).origin === target.origin);
        if (tab) {
            await tab.focus();
            return tab.navigate(target.href);
        }
        return clients.openWindow(target.href);
    })());
});
