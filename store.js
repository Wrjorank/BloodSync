// store.js — client for the BloodSync API: sessions per role, rest calls, realtime refresh.
// all business rules live in backend/; this file only moves data between the pages and the server.

const API_BASE = location.protocol.startsWith('http') ? location.origin : 'http://localhost:5000';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENTS = { PRC: 'PRC', TC: 'Trombosit', WB: 'Whole Blood' };
const URGENCY = { KRITIS: 'Kritis', MENDESAK: 'Mendesak', TERJADWAL: 'Terjadwal' };
const ACTIVE_REQUEST = ['PENDING_VERIFICATION', 'APPROVED', 'BROADCASTING'];
const ACTIVE_TICKET = ['RESERVED', 'ARRIVED', 'SCREENED'];

const REQUEST_STATUS = {
    PENDING_VERIFICATION: 'Menunggu Verifikasi',
    APPROVED: 'Terverifikasi',
    BROADCASTING: 'Pencarian Donor',
    FULFILLED: 'Terpenuhi',
    CLOSED: 'Ditutup',
    REJECTED: 'Ditolak',
    EXPIRED: 'Kedaluwarsa'
};

const TICKET_STATUS = {
    INVITED: 'Diundang',
    DECLINED: 'Menolak',
    RESERVED: 'Menuju faskes',
    ARRIVED: 'Tiba, menunggu skrining',
    SCREENED: 'Lolos skrining',
    SCREENING_FAILED: 'Gagal skrining',
    COLLECTED: 'Darah diambil',
    NO_SHOW: 'Tidak datang',
    CANCELLED: 'Dibatalkan',
    WITHDRAWN: 'Undangan ditarik',
    QUOTA_FULL: 'Kuota penuh'
};

class ApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

// one saved session per role, so the three role pages can be open side by side in one browser
const session = {
    get(role) {
        try { return JSON.parse(localStorage.getItem('bs_session_' + role)); } catch { return null; }
    },
    set(role, data) {
        localStorage.setItem('bs_session_' + role, JSON.stringify(data));
    },
    patch(role, data) {
        this.set(role, { ...this.get(role), ...data });
    },
    clear(role) {
        localStorage.removeItem('bs_session_' + role);
    }
};

async function api(method, path, { role, body, form } = {}) {
    const headers = {};
    const token = role && session.get(role)?.token;
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body) headers['Content-Type'] = 'application/json';
    let res;
    try {
        res = await fetch(API_BASE + '/api' + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
    } catch {
        throw new ApiError(0, 'NETWORK', 'Server tidak dapat dihubungi. Pastikan backend berjalan.');
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
        if (res.status === 401 && role) session.clear(role);
        throw new ApiError(res.status, json?.error?.code || 'ERROR', json?.error?.message || `Permintaan gagal (${res.status})`);
    }
    return json.data;
}

// socket.io client is served by the backend itself
let socketLib = null;
function loadSocketLib() {
    if (window.io) return Promise.resolve();
    socketLib ||= new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = API_BASE + '/socket.io/socket.io.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
    return socketLib;
}

// server events only say "something changed"; the page refetches what it is allowed to see.
// a slow poll covers dropped connections.
function subscribe(role, onChange, { cardToken, pollMs = 20000 } = {}) {
    let timer = null;
    const trigger = () => {
        clearTimeout(timer);
        timer = setTimeout(onChange, 150);
    };
    let socket = null;
    loadSocketLib().then(() => {
        socket = window.io(API_BASE, { auth: { token: role ? session.get(role)?.token : null }, transports: ['websocket', 'polling'] });
        socket.onAny(trigger);
        socket.on('connect', () => {
            if (cardToken) socket.emit('card:subscribe', cardToken);
            trigger();
        });
    }).catch(() => console.warn('realtime tidak tersedia, memakai polling'));
    const poll = setInterval(onChange, pollMs);
    return () => {
        clearInterval(poll);
        socket?.close();
    };
}

const store = {
    meta: () => api('GET', '/public/meta'),
    faskesList: () => api('GET', '/public/faskes'),
    card: (token) => api('GET', `/public/cards/${encodeURIComponent(token)}`),

    requestOtp: (phone, purpose) => api('POST', '/auth/otp/request', { body: { phone, purpose } }),
    verifyOtp: (phone, purpose, code) => api('POST', '/auth/otp/verify', { body: { phone, purpose, code } }),
    staffLogin: (email, password) => api('POST', '/auth/staff/login', { body: { email, password } }),

    family: {
        create: (form) => api('POST', '/requests', { role: 'family', form }),
        list: () => api('GET', '/requests', { role: 'family' }),
        get: (id) => api('GET', `/requests/${id}`, { role: 'family' }),
        cancel: (id) => api('POST', `/requests/${id}/cancel`, { role: 'family' })
    },

    staff: {
        me: () => api('GET', '/faskes/me', { role: 'staff' }),
        stock: () => api('GET', '/faskes/me/stock', { role: 'staff' }),
        adjustStock: (body) => api('POST', '/faskes/me/stock/adjust', { role: 'staff', body }),
        movements: (limit = 8) => api('GET', `/faskes/me/movements?limit=${limit}`, { role: 'staff' }),
        donorPool: () => api('GET', '/faskes/me/donor-pool', { role: 'staff' }),
        arrivals: () => api('GET', '/faskes/me/arrivals', { role: 'staff' }),
        requests: (scope) => api('GET', `/faskes/me/requests?scope=${scope}`, { role: 'staff' }),
        stockOptions: (id) => api('GET', `/faskes/me/requests/${id}/stock-options`, { role: 'staff' }),
        approve: (id) => api('POST', `/faskes/me/requests/${id}/approve`, { role: 'staff' }),
        reject: (id, reason) => api('POST', `/faskes/me/requests/${id}/reject`, { role: 'staff', body: { reason } }),
        allocate: (id) => api('POST', `/faskes/me/requests/${id}/allocate`, { role: 'staff' }),
        transfer: (id, fromFaskesId) => api('POST', `/faskes/me/requests/${id}/transfer`, { role: 'staff', body: { fromFaskesId } }),
        transfers: () => api('GET', '/faskes/me/transfers', { role: 'staff' }),
        approveTransfer: (id) => api('POST', `/faskes/me/transfers/${id}/approve`, { role: 'staff' }),
        rejectTransfer: (id) => api('POST', `/faskes/me/transfers/${id}/reject`, { role: 'staff' }),
        dispatch: (id, body) => api('POST', `/faskes/me/requests/${id}/dispatch`, { role: 'staff', body }),
        close: (id) => api('POST', `/faskes/me/requests/${id}/close`, { role: 'staff' }),
        scan: (code) => api('POST', '/faskes/me/tickets/scan', { role: 'staff', body: { code } }),
        screening: (id, body) => api('POST', `/faskes/me/tickets/${id}/screening`, { role: 'staff', body }),
        collect: (id) => api('POST', `/faskes/me/tickets/${id}/collect`, { role: 'staff' }),
        noShow: (id) => api('POST', `/faskes/me/tickets/${id}/no-show`, { role: 'staff' }),
        // the letter needs the auth header, so it is fetched as a blob instead of a plain link
        async openLetter(id) {
            const res = await fetch(`${API_BASE}/api/faskes/me/requests/${id}/letter`, { headers: { Authorization: 'Bearer ' + session.get('staff')?.token } });
            if (!res.ok) throw new ApiError(res.status, 'LETTER', 'Surat pengantar tidak dapat dibuka');
            window.open(URL.createObjectURL(await res.blob()), '_blank');
        }
    },

    admin: {
        overview: () => api('GET', '/admin/overview', { role: 'admin' }),
        faskes: () => api('GET', '/admin/faskes', { role: 'admin' }),
        createFaskes: (body) => api('POST', '/admin/faskes', { role: 'admin', body }),
        setFaskesActive: (id, isActive) => api('PATCH', `/admin/faskes/${id}/active`, { role: 'admin', body: { isActive } }),
        users: () => api('GET', '/admin/users', { role: 'admin' }),
        createUser: (body) => api('POST', '/admin/users', { role: 'admin', body }),
        setUserActive: (id, isActive) => api('PATCH', `/admin/users/${id}/active`, { role: 'admin', body: { isActive } }),
        audit: (page = 1, actor = '', pageSize = 15) => api('GET', `/admin/audit?page=${page}&pageSize=${pageSize}${actor ? '&actor=' + encodeURIComponent(actor) : ''}`, { role: 'admin' })
    },

    donor: {
        register: (body) => api('POST', '/donors/register', { role: 'donor', body }),
        dashboard: () => api('GET', '/donors/me', { role: 'donor' }),
        updateArea: (area) => api('PATCH', '/donors/me/area', { role: 'donor', body: { area } }),
        updateLocation: (lat, lng) => api('PATCH', '/donors/me/location', { role: 'donor', body: { lat, lng } }),
        respond: (ticketId, accept) => api('POST', `/donors/me/tickets/${ticketId}/respond`, { role: 'donor', body: { accept } }),
        cancel: (ticketId) => api('POST', `/donors/me/tickets/${ticketId}/cancel`, { role: 'donor' }),
        ack: (ticketId) => api('POST', `/donors/me/tickets/${ticketId}/ack`, { role: 'donor' }),
        finishRecovery: () => api('POST', '/donors/me/demo/finish-recovery', { role: 'donor' }),
        deactivate: () => api('DELETE', '/donors/me', { role: 'donor' }),
        reactivate: () => api('POST', '/donors/me/reactivate', { role: 'donor' })
    }
};
