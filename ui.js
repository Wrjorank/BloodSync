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

// 1080x1920 story image for instagram / whatsapp status, drawn on a canvas so it works offline and needs no server
// s: { bloodType, componentLabel, faskesName, faskesArea, needed, fulfilled, deadline, url, code, patient }
async function downloadStory(s) {
    const W = 1080, H = 1920, F = '"Plus Jakarta Sans", sans-serif';
    await Promise.all([800, 700, 600].map(w => document.fonts?.load(`${w} 40px "Plus Jakarta Sans"`))).catch(() => undefined);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const font = (w, px) => { g.font = `${w} ${px}px ${F}`; };
    const round = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    const wrap = (text, maxW) => {
        const lines = [];
        let line = '';
        for (const word of String(text).split(/\s+/)) {
            const next = line ? `${line} ${word}` : word;
            if (g.measureText(next).width > maxW && line) { lines.push(line); line = word; } else line = next;
        }
        return line ? [...lines, line] : lines;
    };

    // background
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#e11d48');
    bg.addColorStop(1, '#881337');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.beginPath(); g.arc(W - 60, 260, 360, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(80, 980, 240, 0, Math.PI * 2); g.fill();

    // header: logo + verified pill
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(112, 118); g.bezierCurveTo(112, 118, 84, 152, 84, 172); g.arc(112, 172, 28, Math.PI, 0, true); g.bezierCurveTo(140, 152, 112, 118, 112, 118);
    g.fill();
    font(800, 52);
    g.textBaseline = 'middle';
    g.fillText('BloodSync', 160, 164);
    font(700, 30);
    const pill = '✓  Terverifikasi faskes';
    const pw = g.measureText(pill).width + 56;
    round(W - 80 - pw, 132, pw, 64, 32);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
    g.fillStyle = '#fff';
    g.fillText(pill, W - 80 - pw + 28, 165);

    // headline
    font(700, 36);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText('P A N G G I L A N   D O N O R   D A R A H', 84, 330);
    font(800, 330);
    g.fillStyle = '#fff';
    g.textBaseline = 'alphabetic';
    g.fillText(s.bloodType, 72, 660);
    font(800, 64);
    g.fillText(s.componentLabel, 84, 760);
    font(600, 44);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    wrap(`${s.faskesName} • ${s.faskesArea}`, W - 168).slice(0, 2).forEach((l, i) => g.fillText(l, 84, 850 + i * 60));

    // white info card
    const cy = 1000;
    round(60, cy, W - 120, 800, 56);
    g.fillStyle = '#fff'; g.fill();

    font(700, 30);
    g.fillStyle = '#94a3b8';
    g.fillText('KEBUTUHAN TERPENUHI', 120, cy + 90);
    font(800, 72);
    g.fillStyle = '#0f172a';
    const prog = `${s.fulfilled} / ${s.needed}`;
    g.fillText(prog, 120, cy + 180);
    const pwid = g.measureText(prog).width;
    font(600, 38);
    g.fillStyle = '#64748b';
    g.fillText('kantong', 120 + pwid + 18, cy + 180);

    const bx = 120, by = cy + 220, bw = W - 240, bh = 32;
    round(bx, by, bw, bh, 16); g.fillStyle = '#f1f5f9'; g.fill();
    const pct = s.needed ? Math.min(1, s.fulfilled / s.needed) : 0;
    if (pct > 0) { round(bx, by, Math.max(bh, bw * pct), bh, 16); g.fillStyle = '#22c55e'; g.fill(); }

    font(600, 32);
    g.fillStyle = '#475569';
    g.fillText(s.deadline ? `Berlaku s.d. ${s.deadline}` : 'Cek status terbaru sebelum datang', 120, cy + 320);

    // qr to the live card
    const holder = document.createElement('div');
    if (window.QRCode) new QRCode(holder, { text: s.url, width: 340, height: 340, correctLevel: QRCode.CorrectLevel.M });
    const qr = holder.querySelector('canvas');
    const qx = 120, qy = cy + 380;
    round(qx - 16, qy - 16, 372, 372, 28);
    g.strokeStyle = '#e2e8f0'; g.lineWidth = 4; g.stroke();
    if (qr) g.drawImage(qr, qx, qy, 340, 340);

    const tx = qx + 400, tw = W - 120 - tx - 40;
    font(800, 40);
    g.fillStyle = '#0f172a';
    wrap('Pindai untuk cek status real-time', tw).forEach((l, i) => g.fillText(l, tx, qy + 50 + i * 52));
    font(500, 30);
    g.fillStyle = '#64748b';
    wrap('Pastikan masih dibutuhkan sebelum berangkat ke UDD faskes.', tw).forEach((l, i) => g.fillText(l, tx, qy + 180 + i * 42));
    font(600, 28);
    g.fillStyle = '#94a3b8';
    g.fillText(`${s.code} • ${s.patient}`, tx, qy + 320);

    // footer
    font(600, 30);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.textAlign = 'center';
    g.fillText('Donor darah gratis. Jangan transfer uang atas nama permintaan ini.', W / 2, 1870);
    g.textAlign = 'left';

    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bloodsync-story-${s.code}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// hide the header while scrolling down, bring it back on any scroll up.
// the header floats over the scroller and only slides, so the layout never shifts and short pages cannot flicker
function autoHideHeader(header, scroller) {
    if (!header || !scroller) return;
    header.parentElement.style.position = 'relative';
    Object.assign(header.style, { position: 'absolute', top: '0', left: '0', right: '0', zIndex: '20', transition: 'transform .25s ease' });
    const pad = () => { scroller.style.paddingTop = `${header.offsetHeight}px`; };
    pad();
    new ResizeObserver(pad).observe(header);
    let last = scroller.scrollTop;
    scroller.addEventListener('scroll', () => {
        const y = scroller.scrollTop;
        if (y <= header.offsetHeight || y - last < -6) header.style.transform = '';
        else if (y - last > 6) header.style.transform = 'translateY(-100%)';
        last = y;
    }, { passive: true });
}
