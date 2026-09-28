// ui.js — shared view helpers for every role page

const TONES = {
    slate: 'bg-slate-100 text-slate-600',
    orange: 'bg-orange-100 text-orange-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700'
};

const REQUEST_TONE = {
    PENDING_VERIFICATION: 'orange', APPROVED: 'amber', BROADCASTING: 'blue',
    FULFILLED: 'green', CLOSED: 'slate', REJECTED: 'red', EXPIRED: 'slate'
};

const TICKET_TONE = {
    INVITED: 'slate', DECLINED: 'slate', RESERVED: 'blue', ARRIVED: 'amber', SCREENED: 'amber',
    SCREENING_FAILED: 'red', COLLECTED: 'green', NO_SHOW: 'red', CANCELLED: 'slate', WITHDRAWN: 'slate', QUOTA_FULL: 'slate'
};

// every piece of user input goes through this before landing in innerHTML
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pill(text, tone = 'slate') {
    return `<span class="${TONES[tone]} px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap">${esc(text)}</span>`;
}

const fmtTime = (ts) => new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (ts) => new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtKm = (km) => km.toFixed(1).replace('.', ',') + ' km';

function fmtDeadline(ts) {
    const d = new Date(ts);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? fmtTime(d) : d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(ms) {
    if (ms <= 0) return '00:00';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// live countdown without re-rendering the page; startCountdowns() keeps these ticking
function countdown(ts) {
    const t = typeof ts === "number" ? ts : Date.parse(ts);
    return `<span data-until="${t}" class="tabular-nums">${fmtDuration(t - Date.now())}</span>`;
}

function startCountdowns() {
    setInterval(() => {
        document.querySelectorAll('[data-until]').forEach(el => {
            el.textContent = fmtDuration(Number(el.dataset.until) - Date.now());
        });
    }, 1000);
}

function maskName(name) {
    return String(name).split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + '***').join(' ');
}

function maskPhone(phone) {
    return phone.length > 7 ? phone.slice(0, 4) + '****' + phone.slice(-3) : phone;
}

function progressBar(p) {
    const pct = (n) => Math.min(100, (n / p.needed) * 100);
    const stripes = 'background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.45) 0 6px,transparent 6px 12px)';
    return `
        <div class="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex">
            <div class="bg-green-500 h-full transition-all duration-700" style="width:${pct(p.fulfilled)}%"></div>
            <div class="bg-blue-400 h-full transition-all duration-700" style="width:${pct(Math.min(p.reserved, p.remaining))}%;${stripes}"></div>
        </div>`;
}

function toast(message, tone = 'info') {
    let box = document.getElementById('toastBox');
    if (!box) {
        box = document.createElement('div');
        box.id = 'toastBox';
        box.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none';
        document.body.appendChild(box);
    }
    const colors = { info: 'bg-slate-900', success: 'bg-green-600', error: 'bg-red-600' };
    const el = document.createElement('div');
    el.className = `${colors[tone]} text-white px-4 py-3 rounded-xl shadow-xl text-sm font-medium whitespace-pre-line transition-opacity duration-300`;
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    }, 4000);
}

// real os notification when the tab is in the background and permission was granted
function systemNotify(title, body) {
    try {
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification(title, { body });
        }
    } catch { /* unsupported context */ }
}

function renderQR(el, text, size) {
    if (!el) return;
    el.innerHTML = '';
    if (window.QRCode) {
        new QRCode(el, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
    } else {
        el.textContent = text;
    }
}
