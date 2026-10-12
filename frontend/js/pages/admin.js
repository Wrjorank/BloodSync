// admin.js — super admin: impact summary, faskes licensing, staff accounts, audit log
const audit  = { page: 1, pageSize: 10, search: '', filters: {}, sort: 'createdAt', dir: 'desc', total: 0, seq: 0 };
const faskes_ = { page: 1, pageSize: 15, data: [], q: '' };
const users_  = { page: 1, pageSize: 15, data: [], q: '' };

const VIEWS = {
    overview: ['Ringkasan', 'Dampak BloodSync secara keseluruhan'],
    facilities: ['Fasilitas Kesehatan', 'Perizinan rumah sakit & UDD PMI'],
    accounts: ['Akun Petugas', 'Kelola akses petugas faskes dan admin'],
    'audit-log': ['Log Aktivitas', 'Siapa melakukan apa, dari mana, dan kapan']
};
// views lived in the hash before they moved to the path (/secretgate19#akun)
const route = viewRouter(Object.keys(VIEWS), 'overview', { ringkasan: 'overview', faskes: 'facilities', akun: 'accounts', audit: 'audit-log' });
let currentView = 'overview';
let wantedView = null;
let unsubscribe = null;
let loadSeq = 0;

const STATUS_COLOR = {
    FULFILLED: 'bg-green-500', BROADCASTING: 'bg-blue-500', APPROVED: 'bg-amber-400', PENDING_VERIFICATION: 'bg-orange-400',
    EXPIRED: 'bg-slate-400', CLOSED: 'bg-slate-300', REJECTED: 'bg-red-400'
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginForm').addEventListener('submit', onLogin);
    document.getElementById('btnLogout').addEventListener('click', signOut);
    document.getElementById('btnLogoutMobile').addEventListener('click', signOut);

    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view, true)));
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => showView(b.dataset.go, true)));
    document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => document.getElementById(b.dataset.open).showModal()));
    document.querySelectorAll('dialog').forEach(d => {
        d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
        d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    });
    const header = document.querySelector('main > header');
    autoHideHeader(header, header.nextElementSibling);
    window.addEventListener('popstate', () => showView(route.current()));
    showView(route.current());

    document.getElementById('faskesSearch').addEventListener('input', (e) => { faskes_.q = e.target.value.trim().toLowerCase(); faskes_.page = 1; renderFaskes(); });
    document.getElementById('usersSearch').addEventListener('input', (e) => { users_.q = e.target.value.trim().toLowerCase(); users_.page = 1; renderUsers(); });
    document.getElementById('faskesForm').addEventListener('submit', onSubmitFaskes);
    document.getElementById('userForm').addEventListener('submit', onSubmitUser);
    document.getElementById('btnAddFaskes').addEventListener('click', () => openFaskesDialog(null));
    document.getElementById('btnAddUser').addEventListener('click', () => openUserDialog(null));
    document.getElementById('userRole').addEventListener('change', (e) => {
        document.getElementById('userFaskesWrap').classList.toggle('invisible', e.target.value !== 'FASKES_STAFF');
    });
    document.getElementById('faskesTable').addEventListener('click', onTableClick);
    document.getElementById('usersTable').addEventListener('click', onTableClick);
    setupAudit();

    // Pagination controls — faskes
    document.getElementById('faskesPrev').addEventListener('click', () => { faskes_.page--; renderFaskes(); });
    document.getElementById('faskesNext').addEventListener('click', () => { faskes_.page++; renderFaskes(); });
    document.getElementById('faskesPageSize').addEventListener('change', (e) => {
        faskes_.pageSize = Number(e.target.value);
        faskes_.page = 1;
        renderFaskes();
    });

    // Pagination controls — users
    document.getElementById('usersPrev').addEventListener('click', () => { users_.page--; renderUsers(); });
    document.getElementById('usersNext').addEventListener('click', () => { users_.page++; renderUsers(); });
    document.getElementById('usersPageSize').addEventListener('change', (e) => {
        users_.pageSize = Number(e.target.value);
        users_.page = 1;
        renderUsers();
    });

    // the export dialog opens on the dataset of the current view
    setupExport({
        download: store.admin.export,
        pick: () => ({ overview: 'requests', facilities: 'facilities', accounts: 'accounts', 'audit-log': 'audit-log' })[currentView] || 'requests',
        extra: (dataset) => (dataset === 'audit-log' ? { actor: audit.search } : {})
    });
    setupImport({
        template: store.admin.importTemplate,
        upload: store.admin.import,
        onDone: () => { load(); loadAudit(); }
    });

    onSessionEnd('admin', () => {
        if (!unsubscribe) return;
        logout();
        toast('Sesi berakhir, silakan masuk kembali.', 'error');
    });
    if (session.get('admin')) start();
    else showLogin(true);
});

async function onLogin(e) {
    e.preventDefault();
    const err = document.getElementById('loginError');
    err.classList.add('hidden');
    await whileBusy(e.target.querySelector('button'), async () => {
        try {
            const result = await store.staffLogin(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
            if (result.user.role !== 'SUPER_ADMIN') throw new Error('Akun ini bukan akun super admin');
            session.set('admin', { token: result.token, user: result.user });
            start();
        } catch (error) {
            err.textContent = error.message;
            err.classList.remove('hidden');
        }
    });
}

// the button: the server records the sign-out first, then the session is dropped
async function signOut() {
    await store.logout('admin');
    logout();
}

function logout() {
    unsubscribe?.();
    unsubscribe = null;
    // drop loads still in flight
    loadSeq++;
    audit.seq++;
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    session.clear('admin');
    showLogin(true);
}

function showLogin(show) {
    document.getElementById('loginView').classList.toggle('hidden', !show);
    // the view asked for in the url is kept across the login screen, then restored
    if (show) {
        wantedView = route.current();
        route.reset();
    } else {
        showView(wantedView || route.current());
        wantedView = null;
    }
    // keep keyboard focus inside the overlay
    document.querySelectorAll('body > aside, body > main').forEach(el => { el.inert = show; });
}

function showView(name, push = false) {
    if (!Object.hasOwn(VIEWS, name)) name = 'overview';
    currentView = name;
    // each view starts at the top, which also brings a hidden header back
    document.querySelector('main > header')?.nextElementSibling?.scrollTo(0, 0);
    document.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== name));
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.getElementById('btnBack').classList.toggle('hidden', name === 'overview');
    document.getElementById('viewTitle').textContent = VIEWS[name][0];
    document.getElementById('viewDesc').textContent = VIEWS[name][1];
    // the login screen keeps a clean url; the view only lands in the path once signed in
    if (session.get('admin')) route.go(name, push);
}

function start() {
    showLogin(false);
    document.getElementById('adminWho').textContent = session.get('admin')?.user.email || '';
    unsubscribe?.();
    // admin has no socket room; a poll keeps the numbers fresh
    const poll = setInterval(load, 15000);
    unsubscribe = () => clearInterval(poll);
    load();
}

// the poll and post-action reloads overlap, so only the newest call may render
async function load() {
    if (!session.get('admin')) return;
    const seq = ++loadSeq;
    try {
        const [overview, faskesList, usersList] = await Promise.all([store.admin.overview(), store.admin.faskes(), store.admin.users()]);
        if (seq !== loadSeq) return;
        renderOverview(overview);
        faskes_.data = faskesList;
        renderFaskes();
        users_.data = usersList;
        renderUsers();
        renderShortcuts();
        await loadAudit();
        if (seq === loadSeq) document.getElementById('syncedAt').textContent = `Diperbarui ${fmtTime(Date.now())}`;
    } catch (error) {
        if (seq !== loadSeq) return;
        if (error.status === 401 || error.status === 403) return logout();
        toast(error.message, 'error');
    }
}

function kpi(label, value, hint, icon, tone) {
    return `
        <div class="card p-5 flex items-start gap-4">
            <div class="w-11 h-11 shrink-0 rounded-xl ${tone} flex items-center justify-center"><i class="fa-solid ${icon}"></i></div>
            <div class="min-w-0">
                <div class="text-xs font-semibold text-slate-500">${label}</div>
                <div class="text-2xl font-extrabold text-slate-900 leading-tight mt-0.5">${value}</div>
                <div class="text-xs text-slate-400 mt-0.5">${hint}</div>
            </div>
        </div>`;
}

function renderOverview(o) {
    const total = Object.values(o.requests).reduce((s, n) => s + n, 0);
    document.getElementById('kpis').innerHTML = [
        kpi('Total permintaan', total, `${o.requests.FULFILLED || 0} terpenuhi`, 'fa-file-medical', 'bg-brand-50 text-brand-600'),
        kpi('Waktu pemenuhan', o.medianMinutesToFulfil === null ? '—' : `${o.medianMinutesToFulfil} mnt`, 'median sejak pengajuan', 'fa-stopwatch', 'bg-amber-50 text-amber-600'),
        kpi('Tingkat respons', o.acceptanceRate === null ? '—' : `${o.acceptanceRate}%`, 'undangan yang disanggupi', 'fa-hand-holding-heart', 'bg-green-50 text-green-600'),
        kpi('Pendonor aktif', o.donors.total, `${o.donors.eligible} siap donor hari ini`, 'fa-users', 'bg-blue-50 text-blue-600')
    ].join('');

    // one stacked bar: share of requests per status, labelled directly
    const entries = Object.entries(o.requests).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    document.getElementById('statusBar').innerHTML = total ? `
        <div class="text-sm font-semibold text-slate-700 mb-3">Status seluruh permintaan</div>
        <div class="flex h-3 rounded-full overflow-hidden bg-slate-100 gap-0.5">
            ${entries.map(([s, n]) => `<div class="${STATUS_COLOR[s]}" style="width:${(n / total) * 100}%" title="${REQUEST_STATUS[s]}: ${n}"></div>`).join('')}
        </div>
        <div class="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-xs text-slate-600">
            ${entries.map(([s, n]) => `<span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full ${STATUS_COLOR[s]}"></span>${REQUEST_STATUS[s]} <b>${n}</b></span>`).join('')}
        </div>` : `
        <div class="flex items-center gap-3 text-sm text-slate-500">
            <div class="w-9 h-9 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center"><i class="fa-solid fa-inbox"></i></div>
            Belum ada permintaan darah yang masuk.
        </div>`;
}

function renderShortcuts() {
    const f = faskes_.data, u = users_.data;
    document.getElementById('sumFaskes').textContent = `${f.filter(x => x.isActive).length} aktif dari ${f.length} faskes`;
    document.getElementById('sumUsers').textContent = `${u.filter(x => x.isActive).length} aktif dari ${u.length} akun`;
}

function toggleButton(kind, id, active) {
    return `<button data-toggle="${kind}" data-id="${esc(id)}" data-active="${active}" title="Klik untuk ${active ? 'menonaktifkan' : 'mengaktifkan'}"
        class="${active ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'} inline-flex items-center gap-1.5 border px-2.5 py-1 rounded-full text-xs font-semibold transition-colors">
        <span class="w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-slate-400'}"></span>${active ? 'Aktif' : 'Nonaktif'}</button>`;
}

// edit / delete icons at the end of each row; self rows get no delete
function actionButtons(kind, id, { canDelete = true } = {}) {
    const base = 'w-8 h-8 inline-flex items-center justify-center rounded-lg transition-colors';
    return `<div class="flex justify-end gap-1">
        <button data-edit="${kind}" data-id="${esc(id)}" class="${base} text-slate-400 hover:text-slate-800 hover:bg-slate-100" title="Edit" aria-label="Edit"><i class="fa-solid fa-pen"></i></button>
        ${canDelete ? `<button data-delete="${kind}" data-id="${esc(id)}" class="${base} text-slate-400 hover:text-red-600 hover:bg-red-50" title="Hapus" aria-label="Hapus"><i class="fa-solid fa-trash-can"></i></button>` : `<span class="w-8"></span>`}
    </div>`;
}

function emptyRow(cols, text) {
    return `<tr><td colspan="${cols}" class="px-5 py-10 text-center text-sm text-slate-400"><i class="fa-regular fa-folder-open text-2xl mb-2 block"></i>${text}</td></tr>`;
}

function pageButtons(containerId, page, pages, onGo) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    const max = 5;
    let start = Math.max(1, page - 2);
    let end   = Math.min(pages, start + max - 1);
    if (end - start < max - 1) start = Math.max(1, end - max + 1);
    for (let i = start; i <= end; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.className = `pg-btn ${i === page ? '!bg-slate-900 !text-white !border-slate-900 !opacity-100' : ''}`;
        btn.disabled = (i === page);
        btn.addEventListener('click', () => onGo(i));
        el.appendChild(btn);
    }
}

// shared footer for client-side paginated tables
function paginate(prefix, state, list, rerender) {
    const pages = Math.max(1, Math.ceil(list.length / state.pageSize));
    const cur   = Math.min(state.page, pages);
    state.page = cur;
    const from = (cur - 1) * state.pageSize;
    document.getElementById(`${prefix}Info`).textContent = list.length ? `${from + 1}–${Math.min(from + state.pageSize, list.length)} dari ${list.length}` : '0 data';
    document.getElementById(`${prefix}Prev`).disabled = cur <= 1;
    document.getElementById(`${prefix}Next`).disabled = cur >= pages;
    pageButtons(`${prefix}Pages`, cur, pages, (p) => { state.page = p; rerender(); });
    return list.slice(from, from + state.pageSize);
}

function renderFaskes() {
    const all = faskes_.data;
    const list = faskes_.q ? all.filter(f => `${f.name} ${f.area}`.toLowerCase().includes(faskes_.q)) : all;
    const slice = paginate('faskes', faskes_, list, renderFaskes);

    document.getElementById('faskesCount').textContent = `${all.filter(f => f.isActive).length} aktif dari ${all.length} faskes`;
    document.getElementById('faskesTable').innerHTML = slice.length ? slice.map(f => `
        <tr class="hover:bg-slate-50/60">
            <td class="td"><div class="font-semibold text-slate-800">${esc(f.name)}</div><div class="text-xs text-slate-400"><i class="fa-solid fa-location-dot mr-1"></i>${esc(f.area)}</div></td>
            <td class="td">${f.type === 'UDD' ? pill('UDD PMI', 'red') : pill('Rumah Sakit', 'blue')}</td>
            <td class="td font-semibold">${f._count.users}</td>
            <td class="td font-semibold">${f._count.requests}</td>
            <td class="td">${toggleButton('faskes', f.id, f.isActive)}</td>
            <td class="td">${actionButtons('faskes', f.id)}</td>
        </tr>`).join('') : emptyRow(6, faskes_.q ? 'Tidak ada faskes yang cocok.' : 'Belum ada faskes.');

    // update select for user form, keeping whatever is picked (even an inactive faskes being edited)
    const keep = document.getElementById('userFaskes').value;
    fillFaskesSelect(keep, users_.data.find(u => u.faskes?.id === keep)?.faskes.name);
}

// active faskes only, plus the kept one: editing a user of an inactive faskes must not silently move them
function fillFaskesSelect(keep, keepName) {
    const select = document.getElementById('userFaskes');
    const list = faskes_.data.filter(f => f.isActive || f.id === keep).map(f => [f.id, f.isActive ? f.name : `${f.name} (nonaktif)`]);
    if (keep && keepName && !list.some(([id]) => id === keep)) list.push([keep, `${keepName} (nonaktif)`]);
    select.innerHTML = list.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
    if (keep && list.some(([id]) => id === keep)) select.value = keep;
}

function renderUsers() {
    const all = users_.data;
    const list = users_.q ? all.filter(u => `${u.name} ${u.email} ${u.faskes?.name || ''}`.toLowerCase().includes(users_.q)) : all;
    const slice = paginate('users', users_, list, renderUsers);
    const me = session.get('admin')?.user.id;

    document.getElementById('usersCount').textContent = `${all.filter(u => u.isActive).length} aktif dari ${all.length} akun`;
    document.getElementById('usersTable').innerHTML = slice.length ? slice.map(u => `
        <tr class="hover:bg-slate-50/60">
            <td class="td">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 shrink-0 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center">${esc(u.name.trim().charAt(0).toUpperCase())}</div>
                    <div class="min-w-0"><div class="font-semibold text-slate-800">${esc(u.name)}</div><div class="text-xs text-slate-400 truncate">${esc(u.email)}</div></div>
                </div>
            </td>
            <td class="td">${u.role === 'SUPER_ADMIN' ? pill('Super admin', 'amber') : pill('Petugas', 'slate')}</td>
            <td class="td">${u.faskes ? esc(u.faskes.name) : '<span class="text-slate-300">—</span>'}</td>
            <td class="td text-xs text-slate-500">${u.lastLoginAt ? `${fmtDate(u.lastLoginAt)}, ${fmtTime(u.lastLoginAt)}` : 'Belum pernah'}</td>
            <td class="td">${u.id === me ? pill('Anda', 'blue') : toggleButton('user', u.id, u.isActive)}</td>
            <td class="td">${actionButtons('user', u.id, { canDelete: u.id !== me })}</td>
        </tr>`).join('') : emptyRow(6, users_.q ? 'Tidak ada akun yang cocok.' : 'Belum ada akun.');
}

// ---------- activity log ----------

const EVENT_STYLE = {
    LOGIN: 'bg-emerald-600 text-white',
    LOGIN_FAILED: 'bg-red-100 text-red-700',
    LOGOUT: 'bg-slate-200 text-slate-700',
    CREATED: 'bg-blue-600 text-white',
    UPDATED: 'bg-sky-500 text-white',
    DELETED: 'bg-red-600 text-white',
    EXPORTED: 'bg-violet-100 text-violet-700',
    IMPORTED: 'bg-indigo-100 text-indigo-700',
    VIEWED: 'bg-amber-100 text-amber-800',
    ERROR: 'bg-red-600 text-white'
};
const ROLE_LABEL = { SUPER_ADMIN: 'super admin', FASKES_STAFF: 'petugas faskes' };
const SUBJECT_LABEL = {
    Facility: 'Faskes', User: 'Akun', BloodRequest: 'Permintaan', StockTransfer: 'Mutasi', Stock: 'Stok', DonorTicket: 'Tiket', Donor: 'Pendonor'
};

function setupAudit() {
    const reload = () => { audit.page = 1; loadAudit(); };
    document.getElementById('auditPrev').addEventListener('click', () => { audit.page = Math.max(1, audit.page - 1); loadAudit(); });
    document.getElementById('auditNext').addEventListener('click', () => { audit.page++; loadAudit(); });
    document.getElementById('auditPageSize').addEventListener('change', (e) => { audit.pageSize = Number(e.target.value); reload(); });
    document.getElementById('auditRefresh').addEventListener('click', loadAudit);

    let typing;
    document.getElementById('auditSearch').addEventListener('input', (e) => {
        clearTimeout(typing);
        typing = setTimeout(() => { audit.search = e.target.value.trim(); reload(); }, 300);
    });

    const filters = document.getElementById('auditFilters');
    const toggle = document.getElementById('auditFilterToggle');
    toggle.addEventListener('click', () => {
        const open = filters.classList.toggle('hidden') === false;
        toggle.setAttribute('aria-expanded', String(open));
    });
    filters.addEventListener('submit', (e) => {
        e.preventDefault();
        audit.filters = Object.fromEntries([...new FormData(filters)].filter(([, v]) => v));
        toggle.classList.toggle('icon-btn-primary', Object.keys(audit.filters).length > 0);
        reload();
    });
    filters.addEventListener('reset', () => {
        audit.filters = {};
        toggle.classList.remove('icon-btn-primary');
        setTimeout(reload);
    });

    document.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => {
        const key = b.dataset.sort;
        audit.dir = audit.sort === key ? (audit.dir === 'asc' ? 'desc' : 'asc') : (key === 'createdAt' ? 'desc' : 'asc');
        audit.sort = key;
        reload();
    }));

    document.getElementById('auditTable').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-audit]');
        if (btn) openAuditDetail(btn.dataset.audit);
    });
    document.querySelectorAll('[data-audit-tab]').forEach(b => b.addEventListener('click', () => showAuditTab(b.dataset.auditTab)));
}

// "2 detik lalu", "3 minggu lalu"
function fmtAgo(ts) {
    const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
    const steps = [[60, 'detik', 1], [3600, 'menit', 60], [86400, 'jam', 3600], [604800, 'hari', 86400], [2592000, 'minggu', 604800], [31536000, 'bulan', 2592000]];
    for (const [limit, unit, size] of steps) if (s < limit) return `${Math.floor(s / size)} ${unit} lalu`;
    return `${Math.floor(s / 31536000)} tahun lalu`;
}

const fmtStamp = (ts) => new Date(ts).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' });
const shortRef = (ref) => (/^[0-9a-f-]{36}$/i.test(ref) ? ref.slice(0, 8) : ref);
const muted = (text) => `<span class="text-slate-400">${text}</span>`;

function auditUser(u) {
    if (u.type === 'staff' || u.type === 'admin') {
        const role = [ROLE_LABEL[u.role] || u.role, u.faskes].filter(Boolean).join(' · ');
        return `<div class="font-semibold text-brand-700 truncate">${esc(u.email || u.label)}</div>
            <div class="text-xs text-slate-500 truncate">${esc(u.label)}${role ? ` · ${esc(role)}` : ''}</div>`;
    }
    if (u.type === 'family' || u.type === 'donor') {
        return `<div class="font-semibold text-slate-700">${esc(u.label)}</div><div class="text-xs text-slate-500">${esc(u.email || '')}</div>`;
    }
    return u.email ? `<div class="text-slate-600 truncate">${esc(u.email)}</div><div class="text-xs text-slate-400">Tamu</div>` : muted('Sistem / Tamu');
}

const eventBadge = (event) => `<span class="badge ${EVENT_STYLE[event] || 'bg-slate-100 text-slate-700'}">${esc(event.replace('_', ' '))}</span>`;
const subject = (a) => (a.subjectType ? `${esc(SUBJECT_LABEL[a.subjectType] || a.subjectType)}${a.ref ? `: <span class="font-mono">${esc(shortRef(a.ref))}</span>` : ''}` : muted('—'));

// rapid paging and typing overlap requests; only the newest one renders
async function loadAudit() {
    const seq = ++audit.seq;
    let result;
    try {
        result = await store.admin.auditLogs({ page: audit.page, pageSize: audit.pageSize, search: audit.search, sort: audit.sort, dir: audit.dir, ...audit.filters });
    } catch (error) {
        if (seq === audit.seq && error.status !== 401) toast(error.message, 'error');
        return;
    }
    if (seq !== audit.seq) return;
    const pages = Math.max(1, Math.ceil(result.total / audit.pageSize));
    // deleting filters or a smaller page size can leave the current page past the end
    if (audit.page > pages) {
        audit.page = pages;
        return loadAudit();
    }
    audit.total = result.total;
    document.getElementById('auditTable').innerHTML = result.items.length ? result.items.map(a => `
        <tr class="hover:bg-slate-50/60 align-middle">
            <td class="td max-w-[260px]">${auditUser(a.user)}</td>
            <td class="td font-mono text-xs">${a.ip ? esc(a.ip) : muted('—')}</td>
            <td class="td whitespace-nowrap">${a.browser && a.browser !== 'Unknown' ? esc(a.browser) : muted('Unknown')}</td>
            <td class="td whitespace-nowrap">${a.platform && a.platform !== 'Unknown' ? esc(a.platform) : muted('Unknown')}</td>
            <td class="td">${eventBadge(a.event)}<div class="text-[11px] text-slate-500 font-mono mt-1">${esc(a.action)}</div></td>
            <td class="td text-sm">${subject(a)}</td>
            <td class="td text-right whitespace-nowrap"><div class="text-[11px] text-slate-500">${fmtAgo(a.createdAt)}</div><div class="tabular-nums">${fmtStamp(a.createdAt)}</div></td>
            <td class="td text-center"><button data-audit="${a.id}" class="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" title="Lihat detail" aria-label="Lihat detail log"><i class="fa-regular fa-eye"></i></button></td>
        </tr>`).join('') : emptyRow(8, audit.search || Object.keys(audit.filters).length ? 'Tidak ada log yang cocok.' : 'Belum ada aktivitas.');

    const from = (audit.page - 1) * audit.pageSize;
    document.getElementById('auditInfo').textContent = result.total
        ? `Menampilkan ${from + 1}–${Math.min(from + audit.pageSize, result.total)} dari ${result.total} entri`
        : 'Menampilkan 0 entri';
    document.getElementById('auditPrev').disabled = audit.page <= 1;
    document.getElementById('auditNext').disabled = audit.page >= pages;
    pageButtons('auditPages', audit.page, pages, (p) => { audit.page = p; loadAudit(); });
    document.querySelectorAll('[data-sort]').forEach(b => {
        const on = b.dataset.sort === audit.sort;
        b.innerHTML = `${b.textContent.trim()} <i class="fa-solid ${on ? (audit.dir === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down') : 'fa-arrows-up-down text-slate-300'} text-[10px]"></i>`;
        b.closest('th').setAttribute('aria-sort', on ? (audit.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
}

function showAuditTab(name) {
    document.querySelectorAll('[data-audit-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.auditTab === name)));
    document.querySelectorAll('[data-audit-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.auditPane !== name));
}

const jsonBlock = (title, value) => `
    <details open class="min-w-0">
        <summary class="cursor-pointer text-sm font-bold text-slate-700 mb-2">${title}</summary>
        <pre class="bg-slate-900 text-slate-100 text-xs leading-relaxed rounded-xl p-4 overflow-auto max-h-80">${esc(JSON.stringify(value, null, 2))}</pre>
    </details>`;

async function openAuditDetail(id) {
    const dialog = document.getElementById('auditDialog');
    const body = document.getElementById('auditDetail');
    body.innerHTML = '<p class="text-sm text-slate-500">Memuat…</p>';
    showAuditTab('detail');
    dialog.showModal();
    let a;
    try {
        a = await store.admin.auditLog(id);
    } catch (error) {
        body.innerHTML = `<p class="text-sm text-red-600">${esc(error.message)}</p>`;
        return;
    }
    const u = a.user;
    const who = u.type === 'staff' || u.type === 'admin'
        ? `${esc(u.label)} ${muted(`(${esc(ROLE_LABEL[u.role] || u.role || u.type)}${u.faskes ? ' · ' + esc(u.faskes) : ''})`)}<div class="text-xs text-slate-500">${esc(u.email || '')}</div>`
        : `${esc(u.label)}${u.email && u.email !== u.label ? ` ${muted(esc(u.email))}` : ''}`;
    const rows = [
        ['Pengguna', who],
        ['Aksi', `${eventBadge(a.event)} <span class="font-mono text-xs text-slate-500 ml-2">${esc(a.action)}</span>`],
        ['Subjek', subject(a) + (a.ref && shortRef(a.ref) !== a.ref ? `<div class="font-mono text-[11px] text-slate-400 break-all">${esc(a.ref)}</div>` : '')],
        ['Waktu', `${fmtDate(a.createdAt)}, ${fmtTime(a.createdAt)} ${muted(`(${fmtAgo(a.createdAt)})`)}`],
        ['Alamat IP', a.ip ? `<span class="font-mono">${esc(a.ip)}</span>` : muted('—')],
        ['Platform', a.platform ? `${esc(a.platform)}${a.device ? ` · ${esc(a.device)}` : ''}` : muted('—')],
        ['Browser', a.browser ? esc(a.browser) : muted('—')],
        ['Request', a.method ? `<span class="font-mono text-xs break-all">${esc(a.method)} ${esc(a.url || '')}</span>` : muted('— (proses sistem)')],
        ['User agent', a.userAgent ? `<span class="text-xs text-slate-500 break-all">${esc(a.userAgent)}</span>` : muted('—')]
    ];
    const hasChange = a.before || a.after;
    body.innerHTML = `
        <div data-audit-pane="detail">
            <dl class="divide-y divide-slate-100 text-sm">
                ${rows.map(([k, v]) => `<div class="grid grid-cols-3 gap-4 py-2.5"><dt class="text-slate-500">${k}</dt><dd class="col-span-2 text-slate-800 min-w-0">${v}</dd></div>`).join('')}
            </dl>
        </div>
        <div data-audit-pane="data" class="hidden space-y-4">
            ${hasChange ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${jsonBlock(a.before ? 'Diubah' : 'Data baru', a.after ?? {})}
                ${a.before ? jsonBlock('Data awal', a.before) : ''}
            </div>` : ''}
            ${a.meta ? jsonBlock('Keterangan', a.meta) : ''}
            ${!hasChange && !a.meta ? '<p class="text-sm text-slate-500">Tidak ada data perubahan untuk log ini.</p>' : ''}
        </div>`;
    showAuditTab('detail');
}

// styled replacement for confirm(); resolves true only when the red button was pressed
function confirmAction({ title, message, ok }) {
    const dialog = document.getElementById('confirmDialog');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmOk').textContent = ok;
    dialog.returnValue = '';
    dialog.showModal();
    return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
}

async function onTableClick(e) {
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-delete]');
    if (edit) {
        const kind = edit.dataset.edit;
        if (kind === 'faskes') openFaskesDialog(faskes_.data.find(f => f.id === edit.dataset.id));
        else openUserDialog(users_.data.find(u => u.id === edit.dataset.id));
        return;
    }
    if (del) return onDelete(del.dataset.delete, del.dataset.id);
    return onToggle(e);
}

async function onDelete(kind, id) {
    const item = kind === 'faskes' ? faskes_.data.find(f => f.id === id) : users_.data.find(u => u.id === id);
    if (!item) return;
    const ok = await confirmAction(kind === 'faskes'
        ? { title: `Hapus ${item.name}?`, message: 'Faskes beserta matriks stoknya dihapus permanen. Faskes yang sudah punya riwayat permintaan atau masih punya akun petugas tidak bisa dihapus; nonaktifkan saja.', ok: 'Hapus faskes' }
        : { title: `Hapus akun ${item.name}?`, message: `${item.email} tidak bisa masuk lagi dan akunnya dihapus permanen. Jejaknya tetap tersimpan di audit log.`, ok: 'Hapus akun' });
    if (!ok) return;
    try {
        if (kind === 'faskes') await store.admin.deleteFaskes(id);
        else await store.admin.deleteUser(id);
        toast(kind === 'faskes' ? 'Faskes dihapus.' : 'Akun dihapus.', 'success');
        load();
    } catch (error) {
        toast(error.message, 'error');
    }
}

// one dialog for both add and edit: data-id on the form marks edit mode
function openFaskesDialog(f) {
    const form = document.getElementById('faskesForm');
    form.reset();
    form.dataset.id = f ? f.id : '';
    document.getElementById('faskesDialogTitle').textContent = f ? 'Edit Faskes' : 'Tambah Faskes';
    document.getElementById('faskesDialogDesc').textContent = f ? 'Perubahan langsung berlaku untuk petugas, pasien, dan pendonor.' : 'Matriks stok 0 kantong dibuat otomatis untuk setiap komponen & golongan.';
    document.getElementById('faskesSubmit').textContent = f ? 'Simpan perubahan' : 'Simpan faskes';
    if (f) {
        for (const k of ['name', 'type', 'area', 'lat', 'lng']) form.elements[k].value = f[k];
        form.elements.address.value = f.address || '';
    }
    document.getElementById('faskesDialog').showModal();
}

function openUserDialog(u) {
    const form = document.getElementById('userForm');
    const self = !!u && u.id === session.get('admin')?.user.id;
    form.reset();
    form.dataset.id = u ? u.id : '';
    document.getElementById('userDialogTitle').textContent = u ? 'Edit Akun' : 'Buat Akun';
    document.getElementById('userDialogDesc').textContent = u
        ? 'Mengganti peran, faskes, atau kata sandi membuat pemilik akun keluar dari semua perangkat.'
        : 'Bagikan email & kata sandi awal ke pemilik akun.';
    document.getElementById('userSubmit').textContent = u ? 'Simpan perubahan' : 'Buat akun';
    document.getElementById('userPasswordLabel').textContent = u ? 'Kata sandi baru (opsional)' : 'Kata sandi awal';
    form.elements.password.required = !u;
    form.elements.password.placeholder = u ? 'Kosongkan jika tidak diganti' : 'Min. 12, huruf besar/kecil, angka, simbol';
    fillFaskesSelect(u?.faskes?.id || '', u?.faskes?.name);
    if (u) {
        form.elements.name.value = u.name;
        form.elements.email.value = u.email;
        form.elements.role.value = u.role;
    }
    // an admin cannot demote themselves, so the system always keeps a super admin
    form.elements.role.disabled = self;
    document.getElementById('userFaskesWrap').classList.toggle('invisible', form.elements.role.value !== 'FASKES_STAFF');
    document.getElementById('userDialog').showModal();
}

async function onToggle(e) {
    const btn = e.target.closest('[data-toggle]');
    if (!btn) return;
    const next = btn.dataset.active !== 'true';
    const what = btn.dataset.toggle === 'faskes' ? 'faskes' : 'akun';
    if (!next && !confirm(`Nonaktifkan ${what} ini? ${what === 'faskes' ? 'Petugasnya tidak bisa masuk dan faskes tidak muncul di formulir pasien.' : 'Pemilik akun tidak bisa masuk.'}`)) return;
    try {
        if (btn.dataset.toggle === 'faskes') await store.admin.setFaskesActive(btn.dataset.id, next);
        else await store.admin.setUserActive(btn.dataset.id, next);
        toast(`Status ${what} diperbarui.`, 'success');
        load();
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function onSubmitFaskes(e) {
    e.preventDefault();
    const id = e.target.dataset.id;
    const f = new FormData(e.target);
    const body = {
        name: f.get('name').trim(), type: f.get('type'), area: f.get('area').trim(),
        lat: Number(f.get('lat')), lng: Number(f.get('lng')), ...(f.get('address').trim() ? { address: f.get('address').trim() } : {})
    };
    await whileBusy(document.getElementById('faskesSubmit'), async () => {
        try {
            if (id) await store.admin.updateFaskes(id, body);
            else await store.admin.createFaskes(body);
            e.target.reset();
            document.getElementById('faskesDialog').close();
            toast(id ? 'Faskes diperbarui.' : 'Faskes ditambahkan. Buat akun petugas untuk faskes ini.', 'success');
            load();
        } catch (error) {
            if (error.status !== 401) toast(error.message, 'error');
        }
    });
}

async function onSubmitUser(e) {
    e.preventDefault();
    const id = e.target.dataset.id;
    const form = e.target;
    // a disabled select is left out of FormData, so read the fields directly
    const body = { name: form.elements.name.value.trim(), email: form.elements.email.value.trim(), role: form.elements.role.value };
    if (form.elements.password.value) body.password = form.elements.password.value;
    if (body.role === 'FASKES_STAFF') body.faskesId = form.elements.faskesId.value;
    await whileBusy(document.getElementById('userSubmit'), async () => {
        try {
            const result = id ? await store.admin.updateUser(id, body) : await store.admin.createUser(body);
            form.reset();
            document.getElementById('userDialog').close();
            // changing your own password ends your own session too
            if (result.self && result.sessionsRevoked) {
                toast('Kata sandi Anda diganti. Silakan masuk kembali.', 'success');
                return logout();
            }
            toast(id ? (result.sessionsRevoked ? 'Akun diperbarui. Pemilik akun perlu masuk ulang.' : 'Akun diperbarui.') : 'Akun dibuat.', 'success');
            load();
        } catch (error) {
            if (error.status !== 401) toast(error.message, 'error');
        }
    });
}
