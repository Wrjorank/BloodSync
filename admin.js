// admin.js — super admin: impact summary, faskes licensing, staff accounts, audit log
const audit = { page: 1, actor: '', total: 0, pageSize: 15 };
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
    document.getElementById('auditPrev').addEventListener('click', () => { audit.page--; loadAudit(); });
    document.getElementById('auditNext').addEventListener('click', () => { audit.page++; loadAudit(); });

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

function start() {
    document.getElementById('loginView').classList.add('hidden');
    unsubscribe?.();
    // admin has no socket room; a poll keeps the numbers fresh
    const poll = setInterval(load, 15000);
    unsubscribe = () => clearInterval(poll);
    load();
}

async function load() {
    if (!session.get('admin')) return;
    try {
        const [overview, faskes, users] = await Promise.all([store.admin.overview(), store.admin.faskes(), store.admin.users()]);
        renderOverview(overview);
        renderFaskes(faskes);
        renderUsers(users, faskes);
        await loadAudit();
    } catch (error) {
        if (error.status === 401 || error.status === 403) return logout();
        toast(error.message, 'error');
    }
}

function kpi(label, value, hint, icon) {
    return `
        <div class="card p-5">
            <div class="flex items-center justify-between">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-400">${label}</span>
                <i class="fa-solid ${icon} text-slate-300"></i>
            </div>
            <div class="text-3xl font-extrabold text-slate-900 mt-2">${value}</div>
            <div class="text-xs text-slate-500 mt-1">${hint}</div>
        </div>`;
}

function renderOverview(o) {
    const total = Object.values(o.requests).reduce((s, n) => s + n, 0);
    document.getElementById('kpis').innerHTML = [
        kpi('Permintaan', total, `${o.requests.FULFILLED || 0} terpenuhi`, 'fa-file-medical'),
        kpi('Waktu pemenuhan', o.medianMinutesToFulfil === null ? '—' : `${o.medianMinutesToFulfil} mnt`, 'median sejak pengajuan', 'fa-stopwatch'),
        kpi('Tingkat respons', o.acceptanceRate === null ? '—' : `${o.acceptanceRate}%`, 'undangan yang disanggupi', 'fa-hand-holding-heart'),
        kpi('Pendonor aktif', o.donors.total, `${o.donors.eligible} siap donor hari ini`, 'fa-users')
    ].join('');

    // one stacked bar: share of requests per status, labelled directly
    const entries = Object.entries(o.requests).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    document.getElementById('statusBar').innerHTML = total ? `
        <div class="text-sm font-semibold text-slate-700 mb-3">Status seluruh permintaan</div>
        <div class="flex h-4 rounded-full overflow-hidden bg-slate-100">
            ${entries.map(([s, n]) => `<div class="${STATUS_COLOR[s]}" style="width:${(n / total) * 100}%" title="${REQUEST_STATUS[s]}: ${n}"></div>`).join('')}
        </div>
        <div class="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-xs text-slate-600">
            ${entries.map(([s, n]) => `<span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full ${STATUS_COLOR[s]}"></span>${REQUEST_STATUS[s]} <b>${n}</b></span>`).join('')}
        </div>` : '<p class="text-sm text-slate-400">Belum ada permintaan.</p>';
}

function toggleButton(kind, id, active) {
    return `<button data-toggle="${kind}" data-id="${esc(id)}" data-active="${active}" class="${active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'} px-2.5 py-1 rounded-md text-xs font-bold hover:opacity-80">${active ? 'Aktif' : 'Nonaktif'}</button>`;
}

function renderFaskes(list) {
    document.getElementById('faskesCount').textContent = `${list.filter(f => f.isActive).length} aktif dari ${list.length}`;
    document.getElementById('faskesTable').innerHTML = list.map(f => `
        <tr>
            <td class="td"><div class="font-semibold">${esc(f.name)}</div><div class="text-xs text-slate-400">${esc(f.area)}</div></td>
            <td class="td">${f.type === 'UDD' ? 'UDD PMI' : 'RS'}</td>
            <td class="td">${f._count.users}</td>
            <td class="td">${f._count.requests}</td>
            <td class="td">${toggleButton('faskes', f.id, f.isActive)}</td>
        </tr>`).join('');
    const select = document.getElementById('userFaskes');
    const keep = select.value;
    select.innerHTML = list.filter(f => f.isActive).map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
    if (keep) select.value = keep;
}

function renderUsers(list) {
    document.getElementById('usersTable').innerHTML = list.map(u => `
        <tr>
            <td class="td"><div class="font-semibold">${esc(u.name)}</div><div class="text-xs text-slate-400">${esc(u.email)}</div></td>
            <td class="td">${u.role === 'SUPER_ADMIN' ? 'Super admin' : 'Petugas'}</td>
            <td class="td">${u.faskes ? esc(u.faskes.name) : '—'}</td>
            <td class="td text-xs">${u.lastLoginAt ? `${fmtDate(u.lastLoginAt)} ${fmtTime(u.lastLoginAt)}` : 'Belum pernah'}</td>
            <td class="td">${u.id === session.get('admin')?.user.id ? pill('Anda', 'blue') : toggleButton('user', u.id, u.isActive)}</td>
        </tr>`).join('');
}

async function loadAudit() {
    const result = await store.admin.audit(audit.page, audit.actor);
    audit.total = result.total;
    document.getElementById('auditTable').innerHTML = result.items.length ? result.items.map(a => `
        <tr>
            <td class="td text-xs whitespace-nowrap">${fmtDate(a.createdAt)} ${fmtTime(a.createdAt)}</td>
            <td class="td text-xs font-mono">${esc(a.actor)}</td>
            <td class="td"><span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-semibold">${esc(a.action)}</span></td>
            <td class="td text-xs font-mono text-slate-500">${esc(a.ref || '—')}</td>
        </tr>`).join('') : '<tr><td class="td text-slate-400" colspan="4">Tidak ada catatan.</td></tr>';
    const pages = Math.max(1, Math.ceil(result.total / audit.pageSize));
    document.getElementById('auditInfo').textContent = `Halaman ${audit.page} dari ${pages} • ${result.total} catatan`;
    document.getElementById('auditPrev').disabled = audit.page <= 1;
    document.getElementById('auditNext').disabled = audit.page >= pages;
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
        toast('Akun dibuat.', 'success');
        load();
    } catch (error) {
        toast(error.message, 'error');
    }
}
