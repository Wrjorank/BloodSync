// push.js — browser push notifications through firebase cloud messaging.
// the realtime socket keeps an open page current; push reaches people whose tab is closed.
// the sdk is only fetched when someone turns notifications on, so pages stay light
const pushNotify = (() => {
    const SDK = ['/vendor/firebase/firebase-app-compat.js', '/vendor/firebase/firebase-messaging-compat.js'];
    const tokenKey = (role) => 'bs_push_' + role;
    let config; // undefined = not asked yet, null = push not configured on the server

    const supported = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

    const stored = (role) => { try { return localStorage.getItem(tokenKey(role)); } catch { return null; } };
    const remember = (role, token) => {
        try {
            if (token) localStorage.setItem(tokenKey(role), token);
            else localStorage.removeItem(tokenKey(role));
        } catch { /* private mode: push still works, the toggle just forgets */ }
    };

    async function loadConfig() {
        if (config === undefined) config = (await store.meta().catch(() => null))?.push ?? null;
        return config;
    }

    function loadScript(src) {
        if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Gagal memuat modul notifikasi'));
            document.head.appendChild(s);
        });
    }

    async function messaging() {
        const cfg = await loadConfig();
        if (!cfg) throw new Error('Notifikasi push belum diaktifkan di server.');
        for (const src of SDK) await loadScript(src);
        const web = { apiKey: cfg.apiKey, projectId: cfg.projectId, messagingSenderId: cfg.messagingSenderId, appId: cfg.appId };
        if (!firebase.apps.length) firebase.initializeApp(web);
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js?' + new URLSearchParams(web), { scope: '/' });
        return { fcm: firebase.messaging(), registration, vapidKey: cfg.vapidKey };
    }

    async function currentToken() {
        const { fcm, registration, vapidKey } = await messaging();
        return fcm.getToken({ vapidKey, serviceWorkerRegistration: registration });
    }

    return {
        // true when this browser can receive push and the server has firebase configured
        async available() {
            return supported() && !!(await loadConfig());
        },

        // on, off, or blocked (the person denied permission in the browser)
        status(role) {
            if (!supported()) return 'off';
            if (Notification.permission === 'denied') return 'blocked';
            return Notification.permission === 'granted' && stored(role) ? 'on' : 'off';
        },

        // must run from a click: browsers only show the permission prompt for a user gesture
        async enable(role, save) {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                throw new Error(permission === 'denied'
                    ? 'Izin notifikasi diblokir. Izinkan lewat ikon gembok di samping alamat situs.'
                    : 'Izin notifikasi belum diberikan.');
            }
            const token = await currentToken();
            await save(token);
            remember(role, token);
        },

        async disable(role, remove) {
            const token = stored(role);
            remember(role, null);
            if (token) await remove(token).catch(() => undefined);
        },

        // sign-out: this browser stops receiving for that account, but remembers the choice for the next sign-in
        async detach(role, remove) {
            const token = stored(role);
            if (token) await remove(token).catch(() => undefined);
        },

        // wires every [data-push-toggle] button: hidden when push is unavailable, label follows the state
        async bind(buttons, role, { save, remove }) {
            const list = [...buttons];
            const ok = list.length && await this.available();
            list.forEach(b => b.classList.toggle('hidden', !ok));
            if (!ok) return;
            const LABEL = { on: 'Notifikasi aktif', off: 'Aktifkan notifikasi', blocked: 'Notifikasi diblokir' };
            const HINT = {
                on: 'Klik untuk mematikan notifikasi di browser ini',
                off: 'Terima notifikasi walau tab BloodSync tertutup',
                blocked: 'Izinkan notifikasi lewat ikon gembok di samping alamat situs'
            };
            const paint = () => {
                const s = this.status(role);
                list.forEach(b => {
                    b.querySelector('[data-push-label]').textContent = LABEL[s];
                    b.title = HINT[s];
                    b.setAttribute('aria-pressed', String(s === 'on'));
                    b.querySelector('i')?.classList.toggle('fa-bell-slash', s !== 'on');
                    b.querySelector('i')?.classList.toggle('fa-bell', s === 'on');
                });
            };
            paint();
            list.forEach(b => b.addEventListener('click', async () => {
                b.disabled = true;
                try {
                    if (this.status(role) === 'on') {
                        await this.disable(role, remove);
                        toast('Notifikasi browser dimatikan.');
                    } else {
                        await this.enable(role, save);
                        toast('Notifikasi aktif. Anda tetap dikabari walau tab ini ditutup.', 'success');
                    }
                } catch (error) {
                    toast(error.message, 'error');
                } finally {
                    b.disabled = false;
                    paint();
                }
            }));
        },

        // after sign-in: re-sends the token so it follows whoever is signed in on this browser
        async resume(role, save) {
            if (this.status(role) !== 'on' || !(await this.available())) return;
            try {
                const token = await currentToken();
                await save(token);
                remember(role, token);
            } catch (error) {
                console.warn('[push]', error.message);
            }
        }
    };
})();
