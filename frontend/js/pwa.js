// pwa.js — registers the site's service worker (/sw.js) on every page: installable app, offline notice,
// and the same registration firebase push uses. the public firebase config rides along in the worker url,
// so push.js and this file must build the url the same way, or the browser would install two workers
const pwa = (() => {
    let ready;

    function workerUrl(push) {
        if (!push) return '/sw.js';
        const { apiKey, projectId, messagingSenderId, appId } = push;
        return '/sw.js?' + new URLSearchParams({ apiKey, projectId, messagingSenderId, appId });
    }

    return {
        // resolves to the registration, or null where service workers are unavailable (http, old browsers)
        register() {
            if (!('serviceWorker' in navigator) || !window.isSecureContext) return Promise.resolve(null);
            // plain fetch: the landing page runs without store.js
            ready ??= fetch('/api/public/meta')
                .then(r => r.json())
                .then(j => j.data)
                .catch(() => null)
                .then(meta => navigator.serviceWorker.register(workerUrl(meta?.push), { scope: '/' }))
                .catch(error => {
                    console.warn('[pwa]', error.message);
                    return null;
                });
            return ready;
        }
    };
})();

window.addEventListener('load', () => pwa.register());
