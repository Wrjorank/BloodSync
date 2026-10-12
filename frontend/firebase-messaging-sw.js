// firebase-messaging-sw.js — shows push notifications while no bloodsync tab is open.
// served from the site root so its scope covers every page; the public web config arrives in the query string
importScripts('/vendor/firebase/firebase-app-compat.js', '/vendor/firebase/firebase-messaging-compat.js');

const config = Object.fromEntries(new URL(self.location.href).searchParams);
if (config.apiKey) {
    firebase.initializeApp({ apiKey: config.apiKey, projectId: config.projectId, messagingSenderId: config.messagingSenderId, appId: config.appId });
    // messages carry a webpush notification block, so the sdk displays them without a custom handler
    firebase.messaging();
}

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
