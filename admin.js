// admin.js — super admin: impact summary, faskes licensing, staff accounts, audit log
const audit  = { page: 1, actor: '', total: 0, pageSize: 15 };
const faskes_ = { page: 1, pageSize: 15, data: [], q: '' };
const users_  = { page: 1, pageSize: 15, data: [], q: '' };

const VIEWS = {
    ringkasan: ['Ringkasan', 'Dampak BloodSync secara keseluruhan'],
    faskes: ['Fasilitas Kesehatan', 'Perizinan rumah sakit & UDD PMI'],
    akun: ['Akun Petugas', 'Kelola akses petugas faskes dan admin'],
    audit: ['Audit Log', 'Jejak perubahan data sistem']
};
let unsubscribe = null;

const STATUS_COLOR = {
    FULFILLED: 'bg-green-500', BROADCASTING: 'bg-blue-500', APPROVED: 'bg-amber-400', PENDING_VERIFICATION: 'bg-orange-400',
    EXPIRED: 'bg-slate-400', CLOSED: 'bg-slate-300', REJECTED: 'bg-red-400'
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginForm').addEventListener('submit', onLogin);
    document.getElementById('demoFill').addEventListener('click', () => {
        document.getElementById('loginEmail').value = 'admin@bloodsync.id';
        document.getElementById('loginPassword').value = 'Admin#1234';
    });
    document.getElementById('btnLogout').addEventListener('click', logout);
    document.getElementById('btnLogoutMobile').addEventListener('click', logout);

    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => showView(b.dataset.go)));
    document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => document.getElementById(b.dataset.open).showModal()));
    document.querySelectorAll('dialog').forEach(d => {
        d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
        d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    });
    const header = document.querySelector('main > header');
    autoHideHeader(header, header.nextElementSibling);
    window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
    showView(location.hash.slice(1));

    document.getElementById('faskesSearch').addEventListener('input', (e) => { faskes_.q = e.target.value.trim().toLowerCase(); faskes_.page = 1; renderFaskes(); });
    document.getElementById('usersSearch').addEventListener('input', (e) => { users_.q = e.target.value.trim().toLowerCase(); users_.page = 1; renderUsers(); });
    document.getElementById('faskesForm').addEventListener('submit', onCreateFaskes);
    document.getElementById('userForm').addEventListener('submit', onCreateUser);
    document.getElementById('userRole').addEventListener('change', (e) => {
        document.getElementById('userFaskesWrap').classList.toggle('invisible', e.target.value !== 'FASKES_STAFF');
    });
    document.getElementById('faskesTable').addEventListener('click', onToggle);
    document.getElementById('usersTable').addEventListener('click', onToggle);
    document.getElementById('auditFilter').addEventListener('submit', (e) => {
        e.preventDefault();
        audit.actor = document.getElementById('auditActor').value.trim();
        audit.page = 1;
        loadAudit();
    });

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

    // Pagination controls — audit
    document.getElementById('auditPrev').addEventListener('click', () => { audit.page--; loadAudit(); });
    document.getElementById('auditNext').addEventListener('click', () => { audit.page++; loadAudit(); });
    document.getElementById('auditPageSize').addEventListener('change', (e) => {
        audit.pageSize = Number(e.target.value);
        audit.page = 1;
        loadAudit();
    });

    if (session.get('admin')) start();
});

async function onLogin(e) {
    e.preventDefault();
    const err = document.getElementById('loginError');
    err.classList.add('hidden');
    try {
        const result = await store.staffLogin(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
        if (result.user.role !== 'SUPER_ADMIN') throw new Error('Akun ini bukan akun super admin');
        session.set('admin', { token: result.token, user: result.user });
        start();
    } catch (error) {
        err.textContent = error.message;
        err.classList.remove('hidden');
    }
}

function logout() {
    unsubscribe?.();
    session.clear('admin');
    document.getElementById('loginView').classList.remove('hidden');
}

function showView(name) {
    if (!VIEWS[name]) name = 'ringkasan';
    // each view starts at the top, which also brings a hidden header back
    document.querySelector('main > header')?.nextElementSibling?.scrollTo(0, 0);
    document.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== name));
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.getElementById('btnBack').classList.toggle('hidden', name === 'ringkasan');
    document.getElementById('viewTitle').textContent = VIEWS[name][0];
    document.getElementById('viewDesc').textContent = VIEWS[name][1];
    if (location.hash.slice(1) !== name) history.replaceState(null, '', `#${name}`);
}

function start() {
    document.getElementById('loginView').classList.add('hidden');
    document.getElementById('adminWho').textContent = session.get('admin')?.user.email || '';
    unsubscribe?.();
    // admin has no socket room; a poll keeps the numbers fresh
    const poll = setInterval(load, 15000);
    unsubscribe = () => clearInterval(poll);
    load();
}

async function load() {
    if (!session.get('admin')) return;
    try {
        const [overview, faskesList, usersList] = await Promise.all([store.admin.overview(), store.admin.faskes(), store.admin.users()]);
        renderOverview(overview);
        faskes_.data = faskesList;
        renderFaskes();
        users_.data = usersList;
        renderUsers();
        renderShortcuts();
        await loadAudit();
        document.getElementById('syncedAt').textContent = `Diperbarui ${fmtTime(Date.now())}`;
    } catch (error) {
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
        </tr>`).join('') : emptyRow(5, faskes_.q ? 'Tidak ada faskes yang cocok.' : 'Belum ada faskes.');

    // update select for user form
    const select = document.getElementById('userFaskes');
    const keep = select.value;
    select.innerHTML = all.filter(f => f.isActive).map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
    if (keep) select.value = keep;
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
        </tr>`).join('') : emptyRow(5, users_.q ? 'Tidak ada akun yang cocok.' : 'Belum ada akun.');
}

async function loadAudit() {
    const result = await store.admin.audit(audit.page, audit.actor, audit.pageSize);
    audit.total = result.total;
    document.getElementById('auditTable').innerHTML = result.items.length ? result.items.map(a => `
        <tr class="hover:bg-slate-50/60">
            <td class="td text-xs text-slate-500 whitespace-nowrap">${fmtDate(a.createdAt)}, ${fmtTime(a.createdAt)}</td>
            <td class="td text-xs font-mono">${esc(a.actor)}</td>
            <td class="td"><span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-semibold">${esc(a.action)}</span></td>
            <td class="td text-xs font-mono text-slate-500">${esc(a.ref || '—')}</td>
        </tr>`).join('') : emptyRow(4, 'Tidak ada catatan.');
    const pages = Math.max(1, Math.ceil(result.total / audit.pageSize));
    const from = (audit.page - 1) * audit.pageSize;
    document.getElementById('auditInfo').textContent = result.total ? `${from + 1}–${Math.min(from + audit.pageSize, result.total)} dari ${result.total}` : '0 data';
    document.getElementById('auditPrev').disabled = audit.page <= 1;
    document.getElementById('auditNext').disabled = audit.page >= pages;
    pageButtons('auditPages', audit.page, pages, (p) => { audit.page = p; loadAudit(); });
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

async function onCreateFaskes(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
        name: f.get('name').trim(), type: f.get('type'), area: f.get('area').trim(),
        lat: Number(f.get('lat')), lng: Number(f.get('lng')), ...(f.get('address').trim() ? { address: f.get('address').trim() } : {})
    };
    try {
        await store.admin.createFaskes(body);
        e.target.reset();
        document.getElementById('faskesDialog').close();
        toast('Faskes ditambahkan. Buat akun petugas untuk faskes ini.', 'success');
        load();
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function onCreateUser(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { name: f.get('name').trim(), email: f.get('email').trim(), password: f.get('password'), role: f.get('role') };
    if (body.role === 'FASKES_STAFF') body.faskesId = f.get('faskesId');
    try {
        await store.admin.createUser(body);
        e.target.reset();
        document.getElementById('userFaskesWrap').classList.remove('invisible');
        document.getElementById('userDialog').close();
        toast('Akun dibuat.', 'success');
        load();
    } catch (error) {
        toast(error.message, 'error');
    }
}
