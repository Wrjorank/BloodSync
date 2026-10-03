// faskes.js — operational dashboard for RS / UDD PMI staff, backed by /api/faskes/me
const DOC_CHECKS = [
    'Nomor rekam medis sesuai data pasien',
    'Komponen & jumlah kantong sesuai surat',
    'Surat ditandatangani dokter penanggung jawab',
    'Tingkat urgensi sesuai kondisi klinis di surat'
];
const REJECT_REASONS = ['Surat pengantar tidak terbaca', 'Data tidak sesuai rekam medis', 'Pasien tidak dirawat di faskes ini'];
let MAX_RADIUS_KM = 15;
let LOW_STOCK = 2;

// server data from the last load
const data = { faskes: null, stock: [], active: [], history: [], options: {}, arrivals: [], movements: [], pool: null, transfers: { incoming: [], outgoing: [] } };
// ui-only state that must survive re-renders
const ui = { checks: {}, rejecting: {}, dispatch: {}, busy: false, modal: null, lastPending: null, unsubscribe: null };

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginForm').addEventListener('submit', onLogin);
    document.getElementById('btnLogout').addEventListener('click', logout);
    document.getElementById('btnLogoutMobile').addEventListener('click', logout);

    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
    document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => document.getElementById(b.dataset.open).showModal()));
    document.querySelectorAll('dialog').forEach(d => {
        d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
        d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    });
    const header = document.querySelector('main > header');
    autoHideHeader(header, header.nextElementSibling);
    window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
    showView(location.hash.slice(1));

    document.getElementById('scanForm').addEventListener('submit', (e) => {
        e.preventDefault();
        scan(document.getElementById('scanCode').value);
    });
    document.getElementById('btnCamera').addEventListener('click', () => (camera.instance ? stopCamera() : startCamera()));
    document.getElementById('adjustType').innerHTML = BLOOD_TYPES.map(t => `<option>${t}</option>`).join('');
    document.getElementById('adjustForm').addEventListener('submit', onAdjust);

    const requests = document.getElementById('requestsContainer');
    requests.addEventListener('click', onRequestClick);
    requests.addEventListener('change', onRequestChange);
    document.getElementById('arrivalsContainer').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-code]');
        if (btn) scan(btn.dataset.code);
    });
    document.getElementById('transfersContainer').addEventListener('click', onTransferClick);
    document.getElementById('screeningBody').addEventListener('submit', onScreeningSubmit);
    document.getElementById('screeningBody').addEventListener('click', onScreeningClick);

    // the export dialog opens on the dataset of the current view
    setupExport({
        download: store.staff.export,
        pick: () => ({ stok: 'stok', permintaan: 'permintaan', pemindai: 'tiket-donor', pendonor: 'tiket-donor' })[location.hash.slice(1)] || 'stok'
    });
    setupImport({ template: store.staff.importTemplate, upload: store.staff.import, onDone: () => load() });

    startCountdowns();
    store.meta().then(m => {
        MAX_RADIUS_KM = m.dispatch.maxRadiusKm;
        LOW_STOCK = m.dispatch.lowStockThreshold;
        Object.assign(CONFIG_SCREENING, m.screening);
    }).catch(() => undefined);
    if (session.get('staff')) start();
    else showLogin(true);
});

const VIEWS = ['stok', 'permintaan', 'pemindai', 'pendonor'];

function showView(name) {
    if (!VIEWS.includes(name)) name = 'stok';
    // each view starts at the top, which also brings a hidden header back
    document.querySelector('main > header')?.nextElementSibling?.scrollTo(0, 0);
    document.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== name));
    document.querySelectorAll('.nav-link, .tab-link').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.getElementById('btnBack').classList.toggle('hidden', name === 'stok');
    if (location.hash.slice(1) !== name) history.replaceState(null, '', `#${name}`);
    if (name === 'pemindai') document.getElementById('scanCode').focus();
    else stopCamera();
}

function showLogin(show) {
    document.getElementById('loginView').classList.toggle('hidden', !show);
}

async function onLogin(e) {
    e.preventDefault();
    const err = document.getElementById('loginError');
    err.classList.add('hidden');
    try {
        const result = await store.staffLogin(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
        if (result.user.role !== 'FASKES_STAFF') throw new Error('Akun ini bukan akun petugas faskes');
        session.set('staff', { token: result.token, faskes: result.faskes, user: result.user });
        start();
    } catch (error) {
        err.textContent = error.message;
        err.classList.remove('hidden');
    }
}

function logout() {
    ui.unsubscribe?.();
    session.clear('staff');
    showLogin(true);
}

function start() {
    showLogin(false);
    document.getElementById('staffWho').textContent = session.get('staff')?.user?.email || '';
    ui.lastPending = null;
    ui.unsubscribe?.();
    ui.unsubscribe = subscribe('staff', load);
    load();
}

// fetch everything the dashboard shows, then render once
async function load() {
    if (!session.get('staff')) return;
    try {
        const [faskes, stock, active, history, arrivals, movements, pool, transfers] = await Promise.all([
            store.staff.me(), store.staff.stock(), store.staff.requests('active'), store.staff.requests('history'),
            store.staff.arrivals(), store.staff.movements(), store.staff.donorPool(), store.staff.transfers()
        ]);
        const needOptions = active.filter(r => r.status === 'APPROVED' || r.status === 'BROADCASTING');
        const options = await Promise.all(needOptions.map(r => store.staff.stockOptions(r.id)));
        Object.assign(data, { faskes, stock, active, history, arrivals, movements, pool, transfers, options: Object.fromEntries(needOptions.map((r, i) => [r.id, options[i]])) });
        render();
    } catch (error) {
        if (error.status === 401) return logout();
        toast(error.message, 'error');
    }
}

// wraps every button action: one at a time, toast on error, reload after success
async function act(fn, success) {
    if (ui.busy) return;
    ui.busy = true;
    try {
        const result = await fn();
        const message = typeof success === 'function' ? success(result) : success;
        if (message) toast(message, 'success');
        await load();
        return result;
    } catch (error) {
        toast(error.message, 'error');
        await load();
    } finally {
        ui.busy = false;
    }
}

function render() {
    const f = data.faskes;
    document.getElementById('faskesName').textContent = f.name;
    document.getElementById('faskesMeta').textContent = `${f.type === 'UDD' ? 'Unit Donor Darah' : 'Rumah Sakit'} • ${f.area}`;
    renderKpis();
    renderStock();
    renderRequests();
    renderArrivals();
    renderTransfers();
    renderMovements();
    renderDonorPool();
    document.getElementById('syncedAt').textContent = `Diperbarui ${fmtTime(Date.now())}`;
}

function kpi(label, value, hint, icon, tone, view) {
    return `
        <button ${view ? `data-go="${view}"` : 'disabled'} class="card p-4 sm:p-5 flex flex-col sm:flex-row items-start gap-3 sm:gap-4 text-left ${view ? 'hover:border-slate-300 transition-colors' : 'cursor-default'}">
            <div class="w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-xl ${tone} flex items-center justify-center"><i class="fa-solid ${icon}"></i></div>
            <div class="min-w-0">
                <div class="text-xs font-semibold text-slate-500">${label}</div>
                <div class="text-2xl font-extrabold text-slate-900 leading-tight mt-0.5">${value}</div>
                <div class="text-xs text-slate-400 mt-0.5">${hint}</div>
            </div>
        </button>`;
}

function renderKpis() {
    const cells = data.stock.flatMap(row => BLOOD_TYPES.map(t => row.byType[t]));
    const total = data.stock.reduce((s, r) => s + r.total, 0);
    const empty = cells.filter(q => q === 0).length;
    const low = cells.filter(q => q > 0 && q < LOW_STOCK).length;
    const pending = data.active.filter(r => r.status === 'PENDING_VERIFICATION').length;
    const el = document.getElementById('kpis');
    el.innerHTML = [
        kpi('Total stok', total, 'kantong tersedia', 'fa-droplet', 'bg-brand-50 text-brand-600'),
        kpi('Stok kosong', empty, `dari ${cells.length} kombinasi`, 'fa-circle-exclamation', 'bg-red-50 text-red-600'),
        kpi('Stok menipis', low, `di bawah ${LOW_STOCK} kantong`, 'fa-triangle-exclamation', 'bg-amber-50 text-amber-600'),
        kpi('Permintaan aktif', data.active.length, pending ? `${pending} menunggu verifikasi` : 'tidak ada yang menunggu', 'fa-file-waveform', 'bg-blue-50 text-blue-600', 'permintaan')
    ].join('');
    el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => showView(b.dataset.go)));
}

// stock matrix: component x ABO/Rh
function renderStock() {
    const head = BLOOD_TYPES.map(t => `<th class="px-1 pb-2 text-center text-xs font-bold text-slate-500">${t}</th>`).join('');
    const rows = data.stock.map(row => {
        const cells = BLOOD_TYPES.map(type => {
            const qty = row.byType[type];
            const tone = qty === 0 ? 'bg-red-50 text-red-600 ring-red-100'
                : qty < LOW_STOCK ? 'bg-amber-50 text-amber-700 ring-amber-100'
                : 'bg-emerald-50 text-emerald-700 ring-emerald-100';
            return `<td class="p-1"><div class="${tone} ring-1 ring-inset rounded-xl h-12 flex items-center justify-center font-extrabold text-lg" title="${esc(row.label)} ${type}: ${qty} kantong">${qty}</div></td>`;
        }).join('');
        return `
            <tr>
                <th class="sticky left-0 z-10 bg-white pl-2 pr-4 py-1 text-left whitespace-nowrap w-36">
                    <div class="font-bold text-slate-800 text-sm">${esc(row.label)}</div>
                    <div class="text-[11px] font-medium text-slate-400">${row.total} kantong</div>
                </th>
                ${cells}
            </tr>`;
    }).join('');
    document.getElementById('stockContainer').innerHTML = `
        <table class="w-full min-w-[640px] table-fixed">
            <thead><tr><th class="sticky left-0 z-10 bg-white w-36"></th>${head}</tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

function emptyState(icon, text) {
    return `<div class="py-6 text-center text-sm text-slate-400"><i class="fa-solid ${icon} text-2xl text-slate-300 mb-2 block"></i>${text}</div>`;
}

function renderRequests() {
    const pending = data.active.filter(r => r.status === 'PENDING_VERIFICATION').length;
    if (ui.lastPending !== null && pending > ui.lastPending) toast('Pengajuan darah baru masuk. Periksa surat pengantar.');
    ui.lastPending = pending;
    const nav = document.getElementById('navPending');
    nav.textContent = pending;
    nav.classList.toggle('hidden', pending === 0);
    document.getElementById('bellDot').classList.toggle('hidden', pending === 0);

    document.getElementById('requestsContainer').innerHTML = data.active.length ? data.active.map(requestCard).join('') : `
        <div class="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
            <div class="w-14 h-14 mx-auto rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center text-xl mb-3"><i class="fa-solid fa-check"></i></div>
            <p class="font-semibold text-slate-700">Tidak ada permintaan darurat aktif</p>
            <p class="text-sm text-slate-400 mt-1">Pengajuan baru akan muncul di sini beserta notifikasi.</p>
        </div>`;

    document.getElementById('historyContainer').innerHTML = data.history.length ? data.history.map(req => `
        <div class="py-3 flex items-center justify-between gap-3 text-sm">
            <div>
                <div class="font-semibold text-slate-700">${esc(req.patientName)} <span class="text-slate-400 font-normal">• ${esc(req.code)}</span></div>
                <div class="text-xs text-slate-500">${esc(req.bloodType)} ${esc(req.componentLabel)} • ${req.progress.fulfilled}/${req.progress.needed} kantong • ${fmtDate(req.createdAt)}</div>
            </div>
            ${pill(REQUEST_STATUS[req.status], REQUEST_TONE[req.status])}
        </div>`).join('') : '<p class="py-3 text-sm text-slate-400">Belum ada riwayat.</p>';
}

function field(label, value) {
    return `<div><dt class="text-slate-400 text-xs">${label}</dt><dd class="font-semibold text-slate-700 truncate">${esc(value)}</dd></div>`;
}

function requestCard(req) {
    const panel = { PENDING_VERIFICATION: verificationPanel, APPROVED: fulfilmentPanel, BROADCASTING: broadcastPanel }[req.status](req, req.progress);
    return `
        <article data-req="${req.id}" class="bg-white rounded-2xl border ${req.urgency === 'KRITIS' ? 'border-red-200' : 'border-slate-200'} p-5 shadow-sm">
            <div class="flex justify-between items-start gap-3 mb-3">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-12 h-12 shrink-0 rounded-xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center font-extrabold text-lg">${esc(req.bloodType)}</div>
                    <div class="min-w-0">
                        <h3 class="font-bold text-slate-800 truncate">${esc(req.patientName)}</h3>
                        <div class="text-xs text-slate-500 mt-0.5">${esc(req.code)} • ${fmtTime(req.createdAt)} • ${esc(req.componentLabel)}</div>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1.5">
                    ${pill(REQUEST_STATUS[req.status], REQUEST_TONE[req.status])}
                    ${pill(URGENCY[req.urgency], req.urgency === 'KRITIS' ? 'red' : 'slate')}
                </div>
            </div>
            <dl class="bg-slate-50 rounded-xl p-3 text-sm border border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
                ${field('No. rekam medis', req.medicalRecordNo)}
                ${field('Ruang perawatan', req.ward)}
                ${field('Kebutuhan', `${req.bagsNeeded} kantong`)}
                ${field('Kontak keluarga', req.phone)}
            </dl>
            ${panel}
        </article>`;
}

// step 1: check the doctor's letter before anything is broadcast
function verificationPanel(req) {
    const checks = ui.checks[req.id] || [];
    const allChecked = DOC_CHECKS.every((_, i) => checks.includes(i));
    const actions = ui.rejecting[req.id] ? `
        <div class="flex flex-col sm:flex-row gap-2">
            <select data-field="rejectReason" class="inp sm:flex-grow">
                ${REJECT_REASONS.map(r => `<option ${ui.rejecting[req.id] === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
            <button data-action="reject" class="bg-red-600 text-white font-semibold rounded-xl px-4 py-2.5 text-sm hover:bg-red-700">Konfirmasi tolak</button>
            <button data-action="reject-cancel" class="btn-ghost px-4 py-2.5 text-sm">Batal</button>
        </div>` : `
        <div class="flex gap-3">
            <button data-action="approve" ${allChecked ? '' : 'disabled'} class="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2">
                <i class="fa-solid fa-check"></i> Setujui pengajuan
            </button>
            <button data-action="reject-open" class="btn-ghost px-4 py-2.5 text-sm">Tolak</button>
        </div>`;
    return `
        <div class="mt-4 pt-4 border-t border-slate-100 space-y-3">
            <div class="flex items-center justify-between gap-3 text-sm bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                <span class="font-semibold text-blue-900 flex items-center gap-2"><i class="fa-solid fa-file-medical"></i> Surat pengantar</span>
                ${req.letter
                    ? `<button data-action="letter" class="text-blue-700 font-semibold hover:underline truncate max-w-[60%]">${esc(req.letter.name)} <i class="fa-solid fa-arrow-up-right-from-square text-xs"></i></button>`
                    : '<span class="text-blue-800">Tidak dilampirkan</span>'}
            </div>
            <div class="space-y-2">
                ${DOC_CHECKS.map((label, i) => `
                    <label class="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer">
                        <input type="checkbox" data-check="${i}" ${checks.includes(i) ? 'checked' : ''} class="w-4 h-4 rounded accent-brand-600">
                        ${label}
                    </label>`).join('')}
            </div>
            ${actions}
        </div>`;
}

// step 2: internal stock -> nearby faskes stock -> public dispatch, in that order
function fulfilmentPanel(req, p) {
    const o = data.options[req.id];
    const homeQty = o ? o.homeTotal : 0;
    const detail = o ? (o.home.filter(x => x.quantity).map(x => `${x.bloodType}: ${x.quantity}`).join(' • ') || `Tidak ada ${req.componentLabel} yang cocok`) : '';
    const elsewhere = o ? o.elsewhere.slice(0, 3) : [];

    const elsewhereHtml = elsewhere.length ? `
        <div>
            <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Stok di faskes terdekat</div>
            <div class="space-y-2">
                ${elsewhere.map(x => `
                    <div class="flex items-center justify-between gap-3 text-sm border border-slate-200 rounded-xl px-3 py-2">
                        <div class="min-w-0 truncate"><span class="font-semibold text-slate-700">${esc(x.faskes.name)}</span> <span class="text-slate-400 text-xs">• ${fmtKm(x.distanceKm)}</span></div>
                        <div class="flex items-center gap-3 shrink-0">
                            <span class="font-bold text-slate-700">${x.quantity} kantong</span>
                            ${o.pendingTransfers.some(t => t.fromFaskesId === x.faskes.id)
                                ? '<span class="text-xs font-semibold text-amber-600">Menunggu persetujuan</span>'
                                : `<button data-action="transfer" data-from="${esc(x.faskes.id)}" data-name="${esc(x.faskes.name)}" class="text-xs font-semibold text-blue-600 hover:underline">Minta mutasi</button>`}
                        </div>
                    </div>`).join('')}
            </div>
        </div>` : '';

    return `
        <div class="mt-4 pt-4 border-t border-slate-100 space-y-4">
            <div class="flex items-center justify-between gap-3 rounded-xl border p-3 ${homeQty ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}">
                <div class="text-sm">
                    <div class="font-semibold ${homeQty ? 'text-green-800' : 'text-red-700'}">${homeQty ? `Stok kompatibel tersedia: ${homeQty} kantong` : 'Stok internal kosong'}</div>
                    <div class="text-xs text-slate-500 mt-0.5">${esc(detail)}</div>
                </div>
                ${homeQty ? `<button data-action="allocate" class="btn-dark px-3 py-2 text-xs shrink-0">Alokasikan ${Math.min(homeQty, p.remaining)} kantong</button>` : ''}
            </div>
            ${elsewhereHtml}
            ${p.remaining > homeQty ? dispatchForm(req, o) : ''}
        </div>`;
}

function selectField(label, name, value, options) {
    return `
        <label class="block">
            <span class="lbl">${label}</span>
            <select data-field="${name}" class="inp">
                ${options.map(([v, text]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${text}</option>`).join('')}
            </select>
        </label>`;
}

function dispatchForm(req, o) {
    const d = ui.dispatch[req.id] ||= { radiusKm: 5, deadlineHours: 4, escalateMinutes: 1, allowCompatible: false };
    const canCompat = req.component === 'PRC';
    const compatTypes = o && req.component === 'PRC' ? o.compatibleTypes.join(', ') : req.bloodType;
    return `
        <div class="rounded-xl border border-brand-100 bg-brand-50/60 p-4 space-y-3">
            <div class="font-bold text-sm text-brand-700 flex items-center gap-2"><i class="fa-solid fa-tower-broadcast"></i> Dispatch Engine</div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                ${selectField('Radius awal', 'radiusKm', d.radiusKm, [[3, '3 km'], [5, '5 km'], [7, '7 km']])}
                ${selectField('Batas waktu', 'deadlineHours', d.deadlineHours, [[2, '2 jam'], [4, '4 jam'], [6, '6 jam'], [12, '12 jam']])}
                ${selectField('Perluas radius tiap', 'escalateMinutes', d.escalateMinutes, [[1, '1 menit'], [10, '10 menit'], [15, '15 menit']])}
            </div>
            <label class="flex items-start gap-2 text-xs ${canCompat ? 'text-slate-600 cursor-pointer' : 'text-slate-400'}">
                <input type="checkbox" data-field="allowCompatible" ${d.allowCompatible && canCompat ? 'checked' : ''} ${canCompat ? '' : 'disabled'} class="mt-0.5 w-4 h-4 rounded accent-brand-600">
                <span>${canCompat
                    ? `Izinkan golongan kompatibel (${esc(compatTypes)}). Golongan identik tetap diprioritaskan.`
                    : 'Trombosit & Whole Blood wajib golongan identik.'}</span>
            </label>
            <button data-action="dispatch" class="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2">
                <i class="fa-solid fa-bullhorn"></i> Aktifkan Panggilan Darurat
            </button>
        </div>`;
}

function stat(label, value) {
    return `
        <div class="bg-slate-50 border border-slate-100 rounded-xl px-2 py-2">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${label}</div>
            <div class="font-bold text-slate-800 text-sm mt-0.5">${value}</div>
        </div>`;
}

const TICKET_ORDER = ['ARRIVED', 'SCREENED', 'RESERVED', 'COLLECTED', 'INVITED', 'SCREENING_FAILED', 'NO_SHOW', 'DECLINED', 'CANCELLED', 'QUOTA_FULL', 'WITHDRAWN'];

// step 3: live view of the wave dispatch and every donor ticket
function broadcastPanel(req, p) {
    const d = req.dispatch;
    const w = d.funnel || { inRadius: 0, typeMatch: 0, eligible: 0, invited: 0, capped: 0 };
    const canEscalate = d.radiusKm < MAX_RADIUS_KM && p.uncovered > 0;
    const homeQty = data.options[req.id]?.homeTotal || 0;
    const tickets = [...req.tickets].sort((a, b) => TICKET_ORDER.indexOf(a.status) - TICKET_ORDER.indexOf(b.status) || a.distanceKm - b.distanceKm);

    const rows = tickets.map(t => {
        const action = {
            RESERVED: `<button data-action="noshow" data-ticket="${t.id}" class="text-xs font-semibold text-red-500 hover:underline">Tidak datang</button>`,
            ARRIVED: `<button data-action="screen" data-code="${t.code}" class="text-xs font-semibold text-blue-600 hover:underline">Skrining</button>`,
            SCREENED: `<button data-action="screen" data-code="${t.code}" class="text-xs font-semibold text-blue-600 hover:underline">Ambil darah</button>`
        }[t.status] || '';
        const extra = t.status === 'RESERVED' ? `<div class="text-[11px] text-blue-600">ETA ${t.etaMin} mnt • slot ${countdown(t.reservedUntil)}</div>` : '';
        return `
            <div class="flex items-center justify-between gap-3 py-2">
                <div class="min-w-0">
                    <div class="text-sm font-semibold text-slate-700 truncate">${esc(t.donor.name)} <span class="text-slate-400 font-normal">• ${esc(t.donor.bloodType)} • ${fmtKm(t.distanceKm)} • G${t.wave}</span></div>
                    ${extra}
                </div>
                <div class="flex items-center gap-3 shrink-0">${action}${pill(TICKET_STATUS[t.status], TICKET_TONE[t.status])}</div>
            </div>`;
    }).join('');

    return `
        <div class="mt-4 pt-4 border-t border-slate-100 space-y-4">
            <div>
                <div class="flex justify-between text-xs font-bold text-slate-500 mb-2">
                    <span><span class="text-green-600">${p.fulfilled} dari ${p.needed}</span> kantong terpenuhi</span>
                    <span class="text-blue-600">${p.reserved} pendonor dalam perjalanan</span>
                </div>
                ${progressBar(p)}
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                ${stat('Gelombang', `${d.wave} • ${d.radiusKm} km`)}
                ${stat('Menunggu respons', p.invited)}
                ${stat('Perluas radius', canEscalate && d.nextEscalationAt ? countdown(d.nextEscalationAt) : '—')}
                ${stat('Batas waktu', countdown(d.deadline))}
            </div>
            <div class="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 leading-relaxed">
                <i class="fa-solid fa-filter text-slate-400 mr-1"></i>
                Penyaringan gelombang ${d.wave}: <b>${w.inRadius}</b> pendonor dalam radius → <b>${w.typeMatch}</b> golongan cocok →
                <b>${w.eligible}</b> eligible → <b>${w.invited}</b> diundang${w.capped ? ` • ${w.capped} dilewati (batas notifikasi mingguan)` : ''}
            </div>
            ${d.maxedOut && p.uncovered > 0 ? `
                <div class="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                    <i class="fa-solid fa-triangle-exclamation mr-1"></i> Radius maksimum ${MAX_RADIUS_KM} km tercapai. Minta keluarga menyebarkan Kartu Darurat terverifikasi.
                </div>` : ''}
            <div class="divide-y divide-slate-100">${rows || '<p class="text-sm text-slate-400 py-2">Belum ada pendonor yang memenuhi syarat di radius ini.</p>'}</div>
            <div class="flex justify-between items-center">
                ${homeQty && p.uncovered ? `<button data-action="allocate" class="text-xs font-semibold text-slate-600 hover:underline">Alokasikan stok internal (${homeQty})</button>` : '<span></span>'}
                <button data-action="close" class="text-xs font-semibold text-slate-400 hover:text-red-600">Tutup panggilan</button>
            </div>
        </div>`;
}

function onRequestChange(e) {
    const card = e.target.closest('[data-req]');
    if (!card) return;
    const id = card.dataset.req;
    if (e.target.dataset.check !== undefined) {
        const i = Number(e.target.dataset.check);
        const checks = new Set(ui.checks[id] || []);
        e.target.checked ? checks.add(i) : checks.delete(i);
        ui.checks[id] = [...checks];
        render();
        return;
    }
    const name = e.target.dataset.field;
    if (name === 'rejectReason') ui.rejecting[id] = e.target.value;
    else if (name === 'allowCompatible') ui.dispatch[id].allowCompatible = e.target.checked;
    else if (name) ui.dispatch[id][name] = Number(e.target.value);
}

function onRequestClick(e) {
    const btn = e.target.closest('[data-action]');
    const card = e.target.closest('[data-req]');
    if (!btn || !card) return;
    const id = card.dataset.req;

    switch (btn.dataset.action) {
        case 'letter':
            store.staff.openLetter(id).catch(err => toast(err.message, 'error'));
            break;
        case 'approve':
            act(() => store.staff.approve(id), 'Pengajuan disetujui. Cek stok sebelum memanggil pendonor.');
            break;
        case 'reject-open':
            ui.rejecting[id] = REJECT_REASONS[0];
            render();
            break;
        case 'reject-cancel':
            delete ui.rejecting[id];
            render();
            break;
        case 'reject': {
            const reason = ui.rejecting[id];
            delete ui.rejecting[id];
            act(() => store.staff.reject(id, reason), 'Pengajuan ditolak.');
            break;
        }
        case 'allocate':
            act(() => store.staff.allocate(id), r => `${r.allocated} kantong dialokasikan dari stok internal.`);
            break;
        case 'transfer':
            act(() => store.staff.transfer(id, btn.dataset.from), r => `Permintaan mutasi ${r.quantity} kantong dikirim ke ${r.source}. Menunggu persetujuan.`);
            break;
        case 'dispatch':
            act(() => store.staff.dispatch(id, ui.dispatch[id]),
                r => `Panggilan darurat aktif.\n${r.funnel?.invited || 0} pendonor cocok dalam radius ${ui.dispatch[id].radiusKm} km menerima notifikasi.`);
            break;
        case 'noshow':
            act(() => store.staff.noShow(btn.dataset.ticket), 'Slot dilepas. Sistem mengundang pendonor cadangan.');
            break;
        case 'screen':
            scan(btn.dataset.code);
            break;
        case 'close':
            if (confirm('Tutup panggilan ini? Pendonor yang diundang akan menerima pembatalan.')) act(() => store.staff.close(id), 'Permintaan ditutup.');
            break;
    }
}

async function onAdjust(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { component: f.get('component'), bloodType: f.get('bloodType'), delta: Number(f.get('delta')), note: String(f.get('note')).trim() };
    const ok = await act(() => store.staff.adjustStock(body), r => `Stok ${body.component} ${body.bloodType} sekarang ${r.quantity} kantong.`);
    if (ok) {
        e.target.reset();
        document.getElementById('adjustDialog').close();
    }
}

function renderArrivals() {
    document.getElementById('arrivalsContainer').innerHTML = data.arrivals.length ? data.arrivals.map(t => `
        <button data-code="${t.code}" class="w-full text-left flex items-center justify-between gap-3 border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 rounded-xl px-3 py-2 transition-colors">
            <div class="min-w-0">
                <div class="text-sm font-semibold text-slate-700 truncate">${esc(t.donor.name)} • ${esc(t.donor.bloodType)}</div>
                <div class="text-[11px] text-slate-500">${t.code} • ${t.status === 'RESERVED' ? `ETA ${t.etaMin} mnt` : TICKET_STATUS[t.status]}</div>
            </div>
            <i class="fa-solid fa-qrcode text-slate-400"></i>
        </button>`).join('') : emptyState('fa-person-walking', 'Belum ada pendonor dalam perjalanan.');
}

// scanning an already-arrived ticket just reopens it, so this also serves as "open screening"
async function scan(code) {
    if (!code.trim()) return toast('Masukkan kode tiket.', 'error');
    try {
        const ticket = await store.staff.scan(code);
        document.getElementById('scanCode').value = '';
        openScreening(ticket);
        load();
    } catch (error) {
        toast(error.message, 'error');
    }
}

// camera qr scanning; the library is fetched on first use so the dashboard stays light
const camera = { instance: null, busy: false };
const QR_LIB = 'vendor/html5-qrcode.min.js';

function loadQrLib() {
    if (window.Html5Qrcode) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = QR_LIB;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Gagal memuat pemindai QR. Muat ulang halaman.'));
        document.head.appendChild(s);
    });
}

function setCameraUi(on, hint = '') {
    document.getElementById('cameraBox').classList.toggle('hidden', !on);
    document.getElementById('cameraHint').textContent = hint;
    const btn = document.getElementById('btnCamera');
    btn.querySelector('span').textContent = on ? 'Matikan kamera' : 'Pindai dengan kamera';
    btn.classList.toggle('btn-primary', !on);
    btn.classList.toggle('btn-ghost', on);
}

async function startCamera() {
    if (camera.busy) return;
    camera.busy = true;
    setCameraUi(true, 'Memulai kamera…');
    try {
        await loadQrLib();
        const reader = new Html5Qrcode('qrReader');
        await reader.start({ facingMode: 'environment' }, { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; } }, onQrDecoded, () => undefined);
        camera.instance = reader;
        setCameraUi(true, 'Arahkan kamera ke QR tiket pendonor');
    } catch (error) {
        setCameraUi(false);
        const denied = /permission|notallowed/i.test(String(error?.name || error));
        toast(denied ? 'Izin kamera ditolak. Aktifkan akses kamera di browser atau ketik kode tiket.' : (error.message || 'Kamera tidak tersedia. Ketik kode tiket secara manual.'), 'error');
    } finally {
        camera.busy = false;
    }
}

async function stopCamera() {
    const reader = camera.instance;
    camera.instance = null;
    if (reader) await reader.stop().then(() => reader.clear()).catch(() => undefined);
    setCameraUi(false);
}

async function onQrDecoded(text) {
    if (!camera.instance) return;
    await stopCamera();
    scan(text);
}

function openScreening(ticket) {
    ui.modal = { ticket, result: null, remaining: null, newBadges: [] };
    const modal = document.getElementById('screeningModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    renderScreening();
}

function closeScreening() {
    ui.modal = null;
    const modal = document.getElementById('screeningModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function renderScreening() {
    const { ticket: t, remaining } = ui.modal;
    const s = CONFIG_SCREENING;
    const header = `
        <div class="flex items-start justify-between mb-5">
            <div>
                <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">${t.code} • ${esc(t.request.code)}</div>
                <h3 class="font-bold text-xl text-slate-900 mt-1">${esc(t.donor.name)}</h3>
                <div class="text-sm text-slate-500">Golongan ${esc(t.donor.bloodType)} • untuk ${COMPONENTS[t.request.component]} ${esc(t.request.bloodType)}</div>
            </div>
            <button data-close class="text-slate-400 hover:text-slate-600" aria-label="Tutup"><i class="fa-solid fa-xmark text-lg"></i></button>
        </div>`;
    const v = t.screening;
    const vitals = v ? `
        <div class="grid grid-cols-3 gap-2 text-center text-sm mb-4">
            ${stat('Tensi', `${v.sys}/${v.dia}`)}
            ${stat('Hb', `${v.hb} g/dL`)}
            ${stat('Berat', `${v.weight} kg`)}
        </div>` : '';

    const body = {
        ARRIVED: () => `
            <form class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                    <label class="block"><span class="lbl">Sistolik (mmHg)</span><input name="sys" type="number" required min="50" max="250" class="inp" placeholder="120"></label>
                    <label class="block"><span class="lbl">Diastolik (mmHg)</span><input name="dia" type="number" required min="30" max="150" class="inp" placeholder="80"></label>
                    <label class="block"><span class="lbl">Hemoglobin (g/dL)</span><input name="hb" type="number" step="0.1" required min="3" max="25" class="inp" placeholder="13.5"></label>
                    <label class="block"><span class="lbl">Berat badan (kg)</span><input name="weight" type="number" required min="25" max="250" class="inp" placeholder="60"></label>
                </div>
                <p class="text-[11px] text-slate-400">Batas: Hb ${s.hbMin}–${s.hbMax} g/dL • tensi ${s.sysMin}–${s.sysMax}/${s.diaMin}–${s.diaMax} mmHg • berat ≥ ${s.weightMin} kg</p>
                <button class="btn-dark w-full py-3 text-sm">Periksa kelayakan</button>
            </form>`,
        SCREENED: () => `
            ${vitals}
            <div class="bg-green-50 border border-green-200 text-green-800 rounded-xl p-3 text-sm font-medium mb-4"><i class="fa-solid fa-circle-check mr-1"></i> Lolos skrining. Lanjutkan pengambilan darah.</div>
            <button data-complete class="btn-primary w-full py-3 text-sm">Selesai Transfusi/Pengambilan</button>`,
        SCREENING_FAILED: () => `
            ${vitals}
            <div class="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-sm mb-4">
                <div class="font-semibold mb-1">Tidak lolos skrining</div>
                <ul class="list-disc pl-5 space-y-0.5">${(v?.reasons || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul>
                <div class="text-xs mt-2">Slot dilepas, sistem mengundang pendonor cadangan.</div>
            </div>
            <button data-close class="btn-ghost w-full py-3 text-sm">Tutup</button>`,
        COLLECTED: () => `
            ${vitals}
            <div class="bg-green-50 border border-green-200 text-green-800 rounded-xl p-3 text-sm mb-4">
                <div class="font-semibold"><i class="fa-solid fa-droplet mr-1"></i> 1 kantong tercatat</div>
                <div class="text-xs mt-1">${ui.modal.toStock ? `${esc(t.request.code)} sudah tidak membutuhkan kantong ini, jadi kantong masuk ke stok faskes.` : `Sisa kebutuhan ${esc(t.request.code)}: ${remaining} kantong.`} Riwayat & masa pemulihan pendonor diperbarui.</div>
            </div>
            <button data-close class="btn-ghost w-full py-3 text-sm">Tutup</button>`
    }[t.status]?.() || `<p class="text-sm text-slate-500 mb-4">Tiket berstatus ${TICKET_STATUS[t.status]}.</p><button data-close class="btn-ghost w-full py-3 text-sm">Tutup</button>`;

    document.getElementById('screeningBody').innerHTML = header + body;
}

async function onScreeningSubmit(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const vitals = Object.fromEntries(['sys', 'dia', 'hb', 'weight'].map(k => [k, Number(f.get(k))]));
    const t = ui.modal.ticket;
    const result = await act(() => store.staff.screening(t.id, vitals), r => (r.pass ? 'Lolos skrining.' : null));
    if (!result || !ui.modal) return;
    if (!result.pass) toast('Pendonor tidak lolos skrining. Slot dialihkan ke cadangan.', 'error');
    t.status = result.pass ? 'SCREENED' : 'SCREENING_FAILED';
    t.screening = { ...vitals, pass: result.pass, reasons: result.reasons };
    renderScreening();
}

async function onScreeningClick(e) {
    if (e.target.closest('[data-close]')) return closeScreening();
    if (!e.target.closest('[data-complete]')) return;
    const t = ui.modal.ticket;
    const result = await act(() => store.staff.collect(t.id), 'Pengambilan selesai. Kebutuhan & inventaris diperbarui.');
    if (!result || !ui.modal) return;
    t.status = 'COLLECTED';
    ui.modal.remaining = result.remaining;
    ui.modal.toStock = result.toStock;
    renderScreening();
}

// incoming = other faskes asking for our stock (we decide); outgoing = our own asks and their outcome
function renderTransfers() {
    const { incoming, outgoing } = data.transfers;
    const tone = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'slate' };
    const label = { PENDING: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak', CANCELLED: 'Dibatalkan' };
    const inHtml = incoming.map(t => `
        <div class="border border-amber-200 bg-amber-50/60 rounded-xl p-3 space-y-2">
            <div class="text-sm"><b>${esc(t.to)}</b> meminta <b>${t.quantity} kantong ${esc(t.request.componentLabel)} ${esc(t.request.bloodType)}</b></div>
            <div class="text-[11px] text-slate-500">${esc(t.request.code)} • ${URGENCY[t.request.urgency]} • ${fmtTime(t.createdAt)}</div>
            <div class="flex gap-2">
                <button data-transfer="approve" data-id="${t.id}" class="btn-dark flex-1 py-2 text-xs">Setujui & kirim</button>
                <button data-transfer="reject" data-id="${t.id}" class="btn-ghost px-3 py-2 text-xs">Tolak</button>
            </div>
        </div>`).join('');
    const outHtml = outgoing.slice(0, 4).map(t => `
        <div class="flex items-center justify-between gap-3 text-xs">
            <span class="text-slate-600 truncate">${esc(t.request.code)} ← ${esc(t.from)} (${t.status === 'APPROVED' ? t.moved : t.quantity} ktg)</span>
            ${pill(label[t.status], tone[t.status])}
        </div>`).join('');
    document.getElementById('transfersContainer').innerHTML =
        (inHtml || emptyState('fa-right-left', 'Tidak ada permintaan mutasi masuk.')) +
        (outHtml ? `<div class="pt-3 mt-3 border-t border-slate-100 space-y-2"><div class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Permintaan kita</div>${outHtml}</div>` : '');
    const badge = document.getElementById('transferBadge');
    badge.textContent = incoming.length;
    badge.classList.toggle('hidden', incoming.length === 0);
}

async function onTransferClick(e) {
    const btn = e.target.closest('[data-transfer]');
    if (!btn) return;
    if (btn.dataset.transfer === 'approve') {
        act(() => store.staff.approveTransfer(btn.dataset.id), r => (r.status === 'APPROVED' ? `${r.moved} kantong dikirim.` : 'Mutasi dibatalkan: stok atau kebutuhan sudah berubah.'));
    } else if (confirm('Tolak permintaan mutasi ini?')) {
        act(() => store.staff.rejectTransfer(btn.dataset.id), 'Permintaan mutasi ditolak.');
    }
}

function renderMovements() {
    const icons = {
        IN: ['fa-arrow-down', 'text-green-600 bg-green-50'],
        OUT: ['fa-arrow-up', 'text-red-500 bg-red-50'],
        TRANSFER: ['fa-right-left', 'text-blue-600 bg-blue-50']
    };
    document.getElementById('movementsContainer').innerHTML = data.movements.length ? data.movements.map(m => {
        const [icon, tone] = icons[m.kind];
        return `
            <div class="flex items-center gap-3 text-sm">
                <div class="w-8 h-8 rounded-lg ${tone} flex items-center justify-center shrink-0"><i class="fa-solid ${icon} text-xs"></i></div>
                <div class="min-w-0 flex-grow">
                    <div class="font-semibold text-slate-700">${m.quantity > 0 ? '+' : ''}${m.quantity} ${COMPONENTS[m.component]} ${esc(m.bloodType)}</div>
                    <div class="text-[11px] text-slate-500 truncate">${esc(m.note)}</div>
                </div>
                <span class="text-[11px] text-slate-400 shrink-0">${fmtTime(m.createdAt)}</span>
            </div>`;
    }).join('') : `<div class="sm:col-span-2 xl:col-span-1">${emptyState('fa-box-open', 'Belum ada mutasi stok.')}</div>`;
}

function renderDonorPool() {
    const pool = data.pool;
    document.getElementById('poolSummary').textContent = `${pool.total} terdaftar • ${pool.eligible} siap donor`;
    document.getElementById('poolContainer').innerHTML = pool.byType.map(t => {
        const pct = t.total ? Math.round((t.eligible / t.total) * 100) : 0;
        return `
        <div class="card p-4">
            <div class="flex items-center justify-between">
                <div class="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center font-extrabold">${t.bloodType}</div>
                <span class="text-xs text-slate-400">${t.total} terdaftar</span>
            </div>
            <div class="mt-3 text-2xl font-extrabold text-slate-900">${t.eligible} <span class="text-sm font-semibold text-slate-400">siap donor</span></div>
            <div class="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-emerald-500 rounded-full" style="width:${pct}%"></div></div>
        </div>`;
    }).join('');
}

// screening limits shown in the form (refreshed from /public/meta); the server re-checks them
const CONFIG_SCREENING = { hbMin: 12.5, hbMax: 17, sysMin: 90, sysMax: 160, diaMin: 60, diaMax: 100, weightMin: 45 };
