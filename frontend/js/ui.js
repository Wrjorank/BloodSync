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

// ---------- local whatsapp inbox ----------
// development without a whatsapp gateway: every message the server would send (otp, donor invites,
// family updates) pops up here instead. the server only enables it locally and never in production
function setupDevInbox() {
    if (typeof store === 'undefined') return;
    store.meta().then(meta => {
        if (!meta.devInbox) return;
        return loadSocketLib().then(() => {
            const socket = window.io(API_BASE, { transports: ['websocket', 'polling'] });
            socket.on('connect', () => socket.emit('dev:inbox', ok => ok && devInboxBadge()));
            socket.on('dev:whatsapp', showWhatsappNotice);
        });
    }).catch(() => undefined);
}

function devInboxBadge() {
    if (document.getElementById('devInboxBadge')) return;
    const badge = document.createElement('div');
    badge.id = 'devInboxBadge';
    badge.className = 'fixed bottom-3 left-3 z-[90] bg-slate-900/90 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full shadow-lg pointer-events-none';
    badge.innerHTML = '<i class="fa-brands fa-whatsapp text-green-400"></i> Mode lokal: WhatsApp tampil sebagai notifikasi';
    document.body.appendChild(badge);
}

function showWhatsappNotice(m) {
    let box = document.getElementById('waInbox');
    if (!box) {
        box = document.createElement('div');
        box.id = 'waInbox';
        box.className = 'fixed bottom-12 right-3 z-[95] flex flex-col gap-2 w-[calc(100%-1.5rem)] max-w-xs';
        document.body.appendChild(box);
    }
    const otp = m.kind === 'otp' ? /\b(\d{6})\b/.exec(m.text)?.[1] : null;
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl shadow-2xl border border-green-200 overflow-hidden';
    card.innerHTML = `
        <div class="bg-green-600 text-white px-3 py-2 flex items-center gap-2 text-xs">
            <i class="fa-brands fa-whatsapp text-base"></i>
            <div class="min-w-0 flex-grow"><div class="font-bold">WhatsApp (simulasi lokal)</div><div data-to class="opacity-90 truncate"></div></div>
            <button data-close-wa class="w-6 h-6 rounded-md hover:bg-white/20" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="p-3 space-y-2">
            <div data-otp class="hidden items-center justify-between gap-2 bg-green-50 rounded-xl px-3 py-2">
                <span data-code class="font-mono text-2xl font-extrabold tracking-[0.3em] text-green-700"></span>
                <button data-copy class="text-xs font-semibold text-green-700 hover:text-green-900"><i class="fa-regular fa-copy"></i> Salin</button>
            </div>
            <p data-text class="text-xs text-slate-600 whitespace-pre-line max-h-40 overflow-y-auto"></p>
        </div>`;
    // the message carries patient names typed by users: text only, never html
    card.querySelector('[data-to]').textContent = `ke ${m.to} • ${fmtTime(m.at)}`;
    card.querySelector('[data-text]').textContent = m.text;
    if (otp) {
        const row = card.querySelector('[data-otp]');
        row.classList.replace('hidden', 'flex');
        card.querySelector('[data-code]').textContent = otp;
        card.querySelector('[data-copy]').addEventListener('click', (e) => {
            navigator.clipboard?.writeText(otp).then(() => { e.currentTarget.innerHTML = '<i class="fa-solid fa-check"></i> Tersalin'; }).catch(() => undefined);
        });
    }
    card.querySelector('[data-close-wa]').addEventListener('click', () => card.remove());
    box.prepend(card);
    while (box.children.length > 4) box.lastElementChild.remove();
    // otp stays as long as it is valid; other messages after a minute
    setTimeout(() => card.remove(), otp ? 5 * 60000 : 60000);
    systemNotify(`WhatsApp ke ${m.to}`, otp ? `Kode OTP: ${otp}` : m.text);
}

document.addEventListener('DOMContentLoaded', setupDevInbox);

// export dialog shared by the staff and admin dashboards (#exportDialog in each page).
// pick() preselects the dataset for the current view; extra(dataset) adds filters such as the audit actor
function setupExport({ download, pick = () => null, extra = () => ({}) }) {
    const dialog = document.getElementById('exportDialog');
    const form = document.getElementById('exportForm');
    const select = form.elements.dataset;
    const ranged = () => select.selectedOptions[0].dataset.range === '1';
    const sync = () => {
        document.getElementById('exportHint').textContent = select.selectedOptions[0].dataset.hint || '';
        document.getElementById('exportRange').classList.toggle('hidden', !ranged());
    };
    select.addEventListener('change', sync);
    document.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', () => {
        const preferred = pick();
        if (preferred) select.value = preferred;
        sync();
        dialog.showModal();
    }));
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        if (ranged()) ['from', 'to'].forEach(k => form.elements[k].value && params.set(k, form.elements[k].value));
        Object.entries(extra(select.value)).forEach(([k, v]) => v && params.set(k, v));
        const btn = form.querySelector('button:not([type])');
        btn.disabled = true;
        try {
            const { rows } = await download(select.value, params.toString());
            toast(rows ? `${rows} baris diekspor ke Excel.` : 'Tidak ada data untuk filter ini. File kosong tetap diunduh.', rows ? 'success' : 'info');
            dialog.close();
        } catch (error) {
            toast(error.message, 'error');
        } finally {
            btn.disabled = false;
        }
    });
}

// import dialog shared by the staff and admin dashboards (#importDialog in each page).
// flow: download template -> pick filled file (checked right away) -> save, which the server allows only when every row is valid.
// everything shown here comes from the uploaded file, so it all goes through esc()
function setupImport({ template, upload, onDone = () => undefined }) {
    const dialog = document.getElementById('importDialog');
    const form = document.getElementById('importForm');
    const select = form.elements.dataset;
    const input = form.elements.file;
    const result = document.getElementById('importResult');
    const commitBtn = document.getElementById('importCommit');
    const fileLabel = document.getElementById('importFileName');
    let file = null;

    const reset = () => {
        file = null;
        input.value = '';
        fileLabel.textContent = '2. Pilih file isian';
        result.classList.add('hidden');
        result.innerHTML = '';
        commitBtn.disabled = true;
        document.getElementById('importHint').textContent = select.selectedOptions[0].dataset.hint || '';
    };
    const table = (head, rows) => `
        <div class="max-h-56 overflow-auto rounded-xl border border-slate-200">
            <table class="w-full text-xs"><thead class="bg-slate-50 sticky top-0"><tr>${head.map(h => `<th class="px-3 py-2 text-left font-bold text-slate-500">${esc(h)}</th>`).join('')}</tr></thead>
            <tbody class="divide-y divide-slate-100">${rows.map(r => `<tr>${r.map(v => `<td class="px-3 py-1.5 text-slate-700">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
        </div>`;
    const show = (html) => {
        result.innerHTML = html;
        result.classList.remove('hidden');
    };
    const issuesBlock = (issues, total) => `
        <div class="rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700 font-medium"><i class="fa-solid fa-circle-exclamation"></i>
            ${esc(issues.length)} baris salah${total ? ` dari ${esc(total)}` : ''}. Perbaiki di Excel, simpan, lalu pilih file lagi. Belum ada data yang disimpan.</div>
        ${table(['Baris', 'Masalah'], issues.map(i => [i.row, i.message]))}`;

    select.addEventListener('change', reset);
    document.querySelectorAll('[data-import]').forEach(b => b.addEventListener('click', () => { reset(); dialog.showModal(); }));
    document.getElementById('importTemplate').addEventListener('click', () =>
        template(select.value).then(() => toast('Template terunduh. Isi di Excel lalu pilih filenya di langkah 2.', 'success')).catch(e => toast(e.message, 'error')));

    input.addEventListener('change', async () => {
        if (!input.files[0]) return;
        file = input.files[0];
        input.value = ''; // picking the same file again after fixing it must trigger a new check
        fileLabel.textContent = file.name;
        commitBtn.disabled = true;
        show('<p class="text-sm text-slate-500"><i class="fa-solid fa-spinner fa-spin"></i> Memeriksa file…</p>');
        try {
            const p = await upload(select.value, file, false);
            const nothing = !p.valid || (select.value === 'stok' && !p.preview.length);
            const head = p.preview[0] ? Object.keys(p.preview[0]) : [];
            show(p.issues.length
                ? issuesBlock(p.issues, p.total)
                : `<div class="rounded-xl ${nothing ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-green-50 border-green-100 text-green-700'} border p-3 text-sm font-medium">
                       <i class="fa-solid ${nothing ? 'fa-circle-info' : 'fa-circle-check'}"></i> ${esc(p.valid)} baris valid. ${esc(p.summary)}</div>
                   ${head.length ? `<p class="text-xs font-semibold text-slate-500">Yang akan disimpan${p.preview.length >= 50 ? ' (50 pertama)' : ''}:</p>${table(head, p.preview.map(r => head.map(h => r[h])))}` : ''}`);
            commitBtn.disabled = p.issues.length > 0 || nothing;
        } catch (error) {
            show(`<div class="rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700 font-medium"><i class="fa-solid fa-circle-exclamation"></i> ${esc(error.message)}</div>`);
        }
    });

    commitBtn.addEventListener('click', async () => {
        if (!file) return;
        commitBtn.disabled = true;
        try {
            const r = await upload(select.value, file, true);
            onDone();
            if (r.file) {
                // new accounts: the password file is the only copy, so keep the dialog open with a reminder
                show(`<div class="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                    <p class="font-bold"><i class="fa-solid fa-key"></i> ${esc(r.imported)} akun dibuat. File kata sandi awal sudah terunduh:</p>
                    <p class="font-mono text-xs mt-1">${esc(r.file)}</p>
                    <p class="mt-2">Ini satu-satunya salinan kata sandi. Bagikan langsung ke pemilik akun, lalu hapus file tersebut.</p></div>`);
                file = null;
                return;
            }
            toast(r.message || 'Import selesai.', 'success');
            dialog.close();
        } catch (error) {
            if (error.details?.issues) show(issuesBlock(error.details.issues));
            else toast(error.message, 'error');
        }
    });
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
