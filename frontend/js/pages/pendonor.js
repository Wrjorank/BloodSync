// pendonor.js — donor app: otp login/registration, targeted alerts, digital ticket, history & recovery cycle
const DISMISSED_KEY = 'bs_reminder_dismissed';
let dash = null;
let pendingPhone = null;
let shownInviteId = null;
let mainKey = null;
let unsubscribe = null;

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('btnSendOtp').addEventListener('click', () => sendOtp(document.getElementById('donorPhone').value));
    document.getElementById('btnVerifyOtp').addEventListener('click', () => verifyOtp(document.getElementById('donorOtp').value.trim()));
    document.getElementById('donorRegForm').addEventListener('submit', onRegister);
    document.getElementById('btnLogout').addEventListener('click', logout);
    document.getElementById('btnAccept').addEventListener('click', () => respond(true));
    document.getElementById('btnDecline').addEventListener('click', () => respond(false));
    document.getElementById('mainArea').addEventListener('click', onMainClick);
    document.getElementById('btnGps').addEventListener('click', () => syncGps(false));
    // browsers only allow sound after a user gesture, so unlock the alarm on the first tap
    document.addEventListener('pointerdown', unlockAlarm, { once: true });
    document.getElementById('availability').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-availability]');
        if (!btn) return;
        const off = btn.dataset.availability === 'off';
        if (off && !confirm('Berhenti menerima panggilan? Undangan & slot yang sedang Anda pegang akan dilepas ke pendonor lain.')) return;
        try {
            await (off ? store.donor.deactivate() : store.donor.reactivate());
            toast(off ? 'Anda tidak akan menerima panggilan darurat.' : 'Profil aktif kembali.', 'success');
            load();
        } catch (error) {
            toast(error.message, 'error');
        }
    });
    document.getElementById('reminder').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-dismiss-reminder]');
        if (!btn) return;
        localStorage.setItem(DISMISSED_KEY, btn.dataset.dismissReminder);
        render();
    });

    try {
        const meta = await store.meta();
        document.getElementById('alertCap').textContent = meta.dispatch.maxAlertsPerWeek;
        document.getElementById('donorArea').innerHTML = '<option value="" disabled selected>Pilih kecamatan</option>' +
            meta.areas.map(a => `<option>${esc(a)}</option>`).join('');
    } catch (error) {
        toast(error.message, 'error');
    }

    startCountdowns();
    const saved = session.get('donor');
    if (saved?.donor) start();
    else {
        if (saved?.token) showRegistration(saved.phone); // otp already verified before a reload
        render();
    }
});

async function sendOtp(phone) {
    try {
        const result = await store.requestOtp(phone, 'DONOR');
        pendingPhone = phone;
        document.getElementById('otpRow').classList.remove('hidden');
        document.getElementById('donorOtp').focus();
        toast('Kode OTP dikirim ke WhatsApp Anda.');
    } catch (error) {
        toast(error.message, 'error');
    }
}

// registered numbers get a donor token straight away; new numbers get a phone token for registration
async function verifyOtp(code) {
    try {
        const result = await store.verifyOtp(pendingPhone, 'DONOR', code);
        session.set('donor', { token: result.token, donor: result.registered, phone: pendingPhone });
        if (result.registered) return start();
        showRegistration(pendingPhone);
    } catch (error) {
        toast(error.message, 'error');
    }
}

function showRegistration(phone) {
    document.getElementById('phoneStep').classList.add('hidden');
    document.getElementById('donorRegForm').classList.remove('hidden');
    document.getElementById('regPhoneLabel').textContent = phone || 'Nomor';
}

async function onRegister(e) {
    e.preventDefault();
    const last = document.getElementById('donorLastDate').value;
    const area = document.getElementById('donorArea').value;
    unlockAlarm();
    // gps is best effort: a denied or slow fix falls back to the kecamatan centroid
    const fix = document.getElementById('consentGps').checked ? await readGps().catch(() => null) : null;
    try {
        const result = await store.donor.register({
            name: document.getElementById('donorName').value.trim(),
            bloodType: document.getElementById('donorAbo').value + document.getElementById('donorRh').value,
            area,
            ...(fix || {}),
            lastDonationAt: last || null,
            consentNotification: document.getElementById('consentNotif').checked,
            consentLocation: document.getElementById('consentGps').checked
        });
        session.set('donor', { token: result.token, donor: true });
        try {
            if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
        } catch { /* unsupported context */ }
        e.target.reset();
        gpsSynced = !!fix;
        toast(fix ? 'Profil aktif. Lokasi GPS Anda tersimpan untuk menghitung jarak ke faskes.' : `Profil aktif. GPS tidak tersedia, memakai lokasi kecamatan ${area}.`, 'success');
        start();
    } catch (error) {
        toast(error.message, 'error');
    }
}

function start() {
    mainKey = null;
    unsubscribe?.();
    unsubscribe = subscribe('donor', load);
    load();
    syncGps(true);
}

// ---------- gps ----------
let gpsSynced = false;

function readGps() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('Perangkat tidak mendukung GPS.'));
        navigator.geolocation.getCurrentPosition(
            p => resolve({ lat: Math.round(p.coords.latitude * 1e5) / 1e5, lng: Math.round(p.coords.longitude * 1e5) / 1e5 }),
            err => reject(new Error(err.code === 1 ? 'Izin lokasi ditolak. Aktifkan akses lokasi di pengaturan browser.' : 'Lokasi GPS belum bisa dibaca. Coba lagi di area terbuka.')),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
        );
    });
}

// silent: refresh once per session only if permission was already granted, never prompt
async function syncGps(silent) {
    if (silent) {
        if (gpsSynced) return;
        const state = await navigator.permissions?.query({ name: 'geolocation' }).then(s => s.state).catch(() => null);
        if (state !== 'granted') return;
    }
    const btn = document.getElementById('btnGps');
    const label = btn.querySelector('span');
    label.textContent = 'Membaca lokasi…';
    btn.disabled = true;
    try {
        const fix = await readGps();
        const result = await store.donor.updateLocation(fix.lat, fix.lng);
        gpsSynced = true;
        if (!silent) toast(`Lokasi GPS diperbarui (sekitar ${result.area}).`, 'success');
        load();
    } catch (error) {
        if (!silent) toast(error.message, 'error');
    } finally {
        label.textContent = 'Perbarui lokasi GPS';
        btn.disabled = false;
    }
}

// ---------- alarm ----------
let alarmCtx = null;

function unlockAlarm() {
    try {
        alarmCtx ||= new (window.AudioContext || window.webkitAudioContext)();
        if (alarmCtx.state === 'suspended') alarmCtx.resume();
    } catch { /* no web audio */ }
}

// two-tone siren, three bursts, synthesized so no audio file is needed
function playAlarm() {
    if (!alarmCtx || alarmCtx.state !== 'running') return;
    const t0 = alarmCtx.currentTime;
    const gain = alarmCtx.createGain();
    gain.connect(alarmCtx.destination);
    gain.gain.setValueAtTime(0.0001, t0);
    for (let burst = 0; burst < 3; burst++) {
        for (let i = 0; i < 4; i++) {
            const start = t0 + burst * 1.2 + i * 0.2;
            const osc = alarmCtx.createOscillator();
            osc.type = 'square';
            osc.frequency.setValueAtTime(i % 2 ? 660 : 880, start);
            osc.connect(gain);
            gain.gain.setTargetAtTime(0.15, start, 0.01);
            gain.gain.setTargetAtTime(0.0001, start + 0.17, 0.01);
            osc.start(start);
            osc.stop(start + 0.2);
        }
    }
}

async function logout() {
    unsubscribe?.();
    gpsSynced = false;
    // revoke on the server first; a phone-only token (registration not finished) has nothing to revoke
    if (session.get('donor')?.donor) await store.donor.logout().catch(() => undefined);
    session.clear('donor');
    dash = null;
    hideInvite();
    document.getElementById('phoneStep').classList.remove('hidden');
    document.getElementById('donorRegForm').classList.add('hidden');
    document.getElementById('otpRow').classList.add('hidden');
    render();
}

async function load() {
    if (!session.get('donor')?.donor) return;
    try {
        dash = await store.donor.dashboard();
        render();
    } catch (error) {
        if (error.status === 401) return logout();
        toast(error.message, 'error');
    }
}

function render() {
    const loggedIn = !!dash && !!session.get('donor')?.donor;
    document.getElementById('regView').classList.toggle('hidden', loggedIn);
    const view = document.getElementById('dashView');
    view.classList.toggle('hidden', !loggedIn);
    view.classList.toggle('flex', loggedIn);
    document.getElementById('btnLogout').classList.toggle('hidden', !loggedIn);
    if (!loggedIn) return hideInvite();
    renderProfile();
    renderReminder();
    renderMain();
    renderHistory();
    renderAvailability();
    renderInvite();
}

function renderProfile() {
    const { profile, eligibility } = dash;
    document.getElementById('dashName').textContent = profile.name;
    document.getElementById('dashInitial').textContent = profile.name.charAt(0).toUpperCase();
    document.getElementById('dashBlood').textContent = profile.bloodType;
    document.getElementById('dashArea').textContent = `${profile.area} • ${profile.phone}`;
    document.getElementById('dashEligible').innerHTML = eligibility.eligible
        ? '<i class="fa-solid fa-circle text-[8px] text-green-400"></i> Siap mendonor'
        : `<i class="fa-solid fa-lock text-[10px] text-yellow-300"></i> Pemulihan • ${eligibility.daysLeft} hari lagi`;
}

// pre-alert: once recovery ends, nudge the donor toward the nearest faskes that is running low
function renderReminder() {
    const box = document.getElementById('reminder');
    const key = `${dash.profile.id}:${dash.profile.lastDonationAt}`;
    if (!dash.reminder || localStorage.getItem(DISMISSED_KEY) === key) {
        box.classList.add('hidden');
        return;
    }
    const low = dash.reminder.lowStock;
    box.innerHTML = `
        <div class="bg-green-50 border border-green-200 rounded-2xl p-4 flex gap-3">
            <div class="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0"><i class="fa-solid fa-calendar-check"></i></div>
            <div class="text-sm text-green-900 flex-grow">
                <p class="font-semibold">${esc(dash.reminder.message)}</p>
                ${low ? `<p class="text-xs mt-1 text-green-800">${esc(low.text)} (${fmtKm(low.distanceKm)} dari Anda)</p>` : ''}
            </div>
            <button data-dismiss-reminder="${esc(key)}" class="text-green-700/60 hover:text-green-800 self-start" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
    box.classList.remove('hidden');
}

// main area shows exactly one of: active ticket, unread outcome, radar, recovery lock
function renderMain() {
    const { activeTicket, outcome, eligibility } = dash;
    const [view, item] = activeTicket ? ['ticket', activeTicket] : outcome ? ['outcome', outcome] : [eligibility.eligible ? 'radar' : 'locked', null];
    const key = `${view}:${item ? (item.id || item.ticketId) + item.status : eligibility.daysLeft}`;
    if (key === mainKey) return;
    mainKey = key;
    document.getElementById('mainArea').innerHTML = { ticket: ticketView, outcome: outcomeView, radar: radarView, locked: lockedView }[view](item);
    if (view === 'ticket') renderQR(document.getElementById('ticketQr'), item.qrPayload, 104);
}

function cell(label, value) {
    return `<div><span class="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">${label}</span><span class="font-bold text-slate-800 text-sm">${esc(value)}</span></div>`;
}

function ticketView(t) {
    const [icon, tone, title, detail] = {
        RESERVED: ['fa-lock', 'bg-blue-50 border-blue-100 text-blue-800', 'Slot dikunci untuk Anda', `Tiba sebelum ${fmtTime(t.reservedUntil)} • sisa ${countdown(t.reservedUntil)}`],
        ARRIVED: ['fa-user-check', 'bg-amber-50 border-amber-100 text-amber-800', 'Check-in berhasil', 'Silakan menuju meja skrining (tensi & Hb).'],
        SCREENED: ['fa-droplet', 'bg-green-50 border-green-100 text-green-800', 'Lolos skrining', 'Pengambilan darah sedang berlangsung.']
    }[t.status];
    return `
        <h3 class="font-bold text-slate-800 mb-3 text-sm flex items-center gap-2"><i class="fa-solid fa-ticket text-brand-500"></i> Tiket Donor Digital</h3>
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="p-5 flex justify-between items-start gap-4">
                <div class="min-w-0">
                    <span class="text-xs text-slate-400 font-bold block mb-1 uppercase tracking-wider">Tujuan</span>
                    <strong class="text-slate-800 text-lg block leading-tight">${esc(t.faskes.name)}</strong>
                    <span class="text-xs text-slate-500">${esc(t.faskes.area)} • ${fmtKm(t.distanceKm)}</span>
                    <div class="mt-3 font-mono font-bold text-lg tracking-widest text-slate-900">${esc(t.code)}</div>
                </div>
                <div id="ticketQr" class="shrink-0 p-1.5 bg-white border border-slate-100 rounded-xl"></div>
            </div>
            <div class="border-t border-dashed border-slate-200 px-5 py-4 grid grid-cols-3 gap-3 text-center">
                ${cell('Komponen', t.request.componentLabel)}
                ${cell('Untuk gol.', t.request.bloodType)}
                ${cell('Estimasi', `${t.etaMin} mnt`)}
            </div>
            <div class="px-5 pb-5 space-y-3">
                <div class="${tone} border rounded-xl px-3 py-2.5 text-sm">
                    <div class="font-semibold"><i class="fa-solid ${icon} mr-1"></i> ${title}</div>
                    <div class="text-xs mt-0.5">${detail}</div>
                </div>
                <a href="${esc(t.faskes.mapsUrl)}" target="_blank" rel="noopener" class="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-slate-800">
                    <i class="fa-solid fa-map-location-dot"></i> Buka navigasi Google Maps
                </a>
                ${t.status === 'RESERVED' ? `<button data-cancel="${t.id}" class="w-full text-xs font-semibold text-slate-400 hover:text-red-500 py-1">Batal datang (slot dialihkan ke pendonor lain)</button>` : ''}
                <p class="text-[11px] text-slate-400 text-center">Tunjukkan QR ini ke petugas UDD saat tiba.</p>
            </div>
        </div>`;
}

function outcomeView(o) {
    const close = `<button data-ack="${o.ticketId}" class="mt-5 w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800">Tutup</button>`;
    if (o.status === 'COLLECTED') {
        const badges = (o.newBadges || []).map(id => dash.badges.find(b => b.id === id)).filter(Boolean).map(b => `
            <span class="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full"><i class="fa-solid ${b.icon}"></i> ${esc(b.label)}</span>`).join('');
        return `
            <div class="bg-white rounded-2xl border border-green-200 p-6 text-center shadow-sm">
                <div class="w-16 h-16 mx-auto rounded-full bg-green-100 text-green-600 flex items-center justify-center text-2xl mb-3"><i class="fa-solid fa-heart"></i></div>
                <h3 class="font-extrabold text-xl text-slate-900">Terima kasih, ${esc(dash.profile.name.split(' ')[0])}!</h3>
                <p class="text-sm text-slate-500 mt-2">Donor Anda di ${esc(o.faskes)} sudah tercatat untuk ${esc(o.requestCode)}.</p>
                ${dash.eligibility.nextDate ? `<p class="text-xs text-slate-500 mt-3 bg-slate-50 border border-slate-100 rounded-xl p-3">Kalender donor dikunci hingga <b>${fmtDate(dash.eligibility.nextDate)}</b>. Anda tidak akan menerima panggilan darurat selama masa pemulihan.</p>` : ''}
                ${badges ? `<div class="mt-4"><div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Lencana baru</div><div class="flex flex-wrap justify-center gap-2">${badges}</div></div>` : ''}
                ${close}
            </div>`;
    }
    const [icon, title, body] = o.status === 'SCREENING_FAILED'
        ? ['fa-stethoscope', 'Belum bisa donor hari ini', `<ul class="text-left list-disc pl-5 space-y-0.5">${(o.reasons || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul><p class="mt-2">Terima kasih sudah datang. Slot Anda dialihkan ke pendonor cadangan.</p>`]
        : ['fa-circle-info', o.status === 'NO_SHOW' ? 'Slot Anda dilepas' : 'Kedatangan dibatalkan', esc(o.note)];
    return `
        <div class="bg-white rounded-2xl border border-slate-200 p-6 text-center shadow-sm">
            <div class="w-14 h-14 mx-auto rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xl mb-3"><i class="fa-solid ${icon}"></i></div>
            <h3 class="font-bold text-lg text-slate-900">${title}</h3>
            <div class="text-sm text-slate-500 mt-2">${body}</div>
            ${close}
        </div>`;
}

function radarView() {
    return `
        <div class="flex flex-col items-center justify-center py-8 text-center">
            <div class="w-32 h-32 rounded-full border border-brand-200 bg-brand-50 flex items-center justify-center text-brand-300 text-4xl relative mb-6">
                <i class="fa-solid fa-location-dot z-10 relative"></i>
                <div class="absolute inset-0 rounded-full border border-brand-300 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] opacity-50"></div>
                <div class="absolute inset-0 rounded-full border border-brand-300 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] opacity-30" style="animation-delay:1s"></div>
            </div>
            <h3 class="font-bold text-slate-700 mb-2">Memantau sekitar…</h3>
            <p class="text-sm text-slate-500 max-w-[290px]">Anda akan dihubungi bila pasien membutuhkan golongan <b>${esc(dash.profile.bloodType)}</b> (atau yang kompatibel) di faskes dalam radius panggilan dari ${esc(dash.profile.area)}.</p>
        </div>`;
}

function lockedView() {
    const el = dash.eligibility;
    const pct = Math.round(100 - (el.daysLeft / el.cycleDays) * 100);
    return `
        <div class="bg-white rounded-2xl border border-slate-200 p-6 text-center shadow-sm">
            <div class="w-16 h-16 mx-auto rounded-full bg-amber-50 text-amber-500 flex items-center justify-center text-2xl mb-3"><i class="fa-solid fa-bed"></i></div>
            <h3 class="font-bold text-slate-800">Masa pemulihan</h3>
            <p class="text-sm text-slate-500 mt-1">Panggilan darurat dijeda ${el.daysLeft} hari lagi, hingga <b>${fmtDate(el.nextDate)}</b>.</p>
            <div class="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-amber-400 rounded-full" style="width:${pct}%"></div></div>
            <button data-finish-recovery class="mt-5 text-xs font-semibold text-slate-400 hover:text-slate-600 underline">Lewati masa pemulihan</button>
        </div>`;
}

function renderAvailability() {
    const active = dash.profile.isActive;
    document.getElementById('availability').innerHTML = active
        ? '<button data-availability="off" class="text-xs font-semibold text-slate-400 hover:text-red-500 underline">Berhenti sementara menerima panggilan darurat</button>'
        : `<div class="bg-slate-100 border border-slate-200 rounded-xl p-3 text-sm text-slate-600 flex items-center justify-between gap-3">
               <span><i class="fa-solid fa-bell-slash mr-1"></i> Anda tidak menerima panggilan darurat.</span>
               <button data-availability="on" class="text-xs font-bold text-brand-600 hover:underline shrink-0">Aktifkan lagi</button>
           </div>`;
}

function renderHistory() {
    document.getElementById('badgeList').innerHTML = dash.badges.map(b => `
        <div class="rounded-xl border p-3 text-center ${b.earned ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-300'}">
            <i class="fa-solid ${b.icon} text-lg"></i>
            <div class="text-[11px] font-bold mt-1 ${b.earned ? 'text-amber-800' : 'text-slate-400'}">${esc(b.label)}</div>
        </div>`).join('');
    document.getElementById('donationList').innerHTML = dash.donations.length ? dash.donations.map(d => `
        <div class="flex items-center justify-between px-4 py-3 text-sm">
            <div>
                <div class="font-semibold text-slate-700">${d.faskes ? esc(d.faskes) : 'Donor sebelumnya'}</div>
                <div class="text-xs text-slate-500">${COMPONENTS[d.component]}${d.requestCode ? ' • ' + esc(d.requestCode) : ''}</div>
            </div>
            <span class="text-xs text-slate-400">${fmtDate(d.at)}</span>
        </div>`).join('') : '<p class="px-4 py-3 text-sm text-slate-400">Belum ada riwayat donor.</p>';
}

// targeted push notification for the INVITED ticket the dispatch engine created for this donor
function renderInvite() {
    const modal = document.getElementById('inviteModal');
    const visible = !modal.classList.contains('hidden');
    const invite = dash.invite;
    if (!invite) {
        if (visible) {
            hideInvite();
            toast('Panggilan ditarik: kebutuhan pendonor sudah tercukupi.');
        }
        return;
    }
    if (visible && shownInviteId === invite.ticketId) return;
    shownInviteId = invite.ticketId;
    const r = invite.request;
    document.getElementById('inviteBody').innerHTML = `
        <div class="flex items-start gap-4 pt-2">
            <div class="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 relative pulse-ring"><i class="fa-solid fa-bell text-xl"></i></div>
            <div class="min-w-0">
                <div class="flex items-center gap-2 mb-1 flex-wrap">
                    <span class="${r.urgency === 'KRITIS' ? 'bg-red-500' : 'bg-orange-500'} text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">${URGENCY[r.urgency]}</span>
                    <span class="text-xs font-semibold text-slate-500">Jarak ${fmtKm(invite.distanceKm)}</span>
                </div>
                <h3 class="font-bold text-slate-800 text-lg leading-tight">Panggilan Darurat: ${esc(invite.faskes.name)}</h3>
            </div>
        </div>
        <p class="text-sm text-slate-600 mt-4 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
            Pasien di <b class="text-slate-800">${esc(invite.faskes.name)}</b> butuh <b class="text-slate-800">${r.bagsNeeded} kantong ${esc(r.componentLabel)} ${esc(r.bloodType)}</b>.
            Jarak Anda ${fmtKm(invite.distanceKm)}. Bersedia membantu?
        </p>
        <div class="grid grid-cols-3 gap-2 mt-3 text-center">
            ${cell('Komponen', r.componentLabel)}
            <div><span class="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Batas waktu</span><span class="font-bold text-slate-800 text-sm">${r.deadline ? countdown(r.deadline) : '—'}</span></div>
            ${cell('Estimasi', `${invite.etaMin} mnt`)}
        </div>
        ${r.compatibleOnly ? `<p class="text-[11px] text-slate-500 mt-3">Golongan Anda (${esc(dash.profile.bloodType)}) kompatibel untuk kebutuhan PRC ${esc(r.bloodType)}.</p>` : ''}`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    try { navigator.vibrate?.([200, 100, 200, 100, 500]); } catch { /* blocked without user gesture */ }
    playAlarm();
    systemNotify('Panggilan Darurat BloodSync', `${invite.faskes.name} butuh ${r.bagsNeeded} kantong ${r.bloodType}. Jarak Anda ${fmtKm(invite.distanceKm)}.`);
}

function hideInvite() {
    const modal = document.getElementById('inviteModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    shownInviteId = null;
}

// hide first so the reload that follows is not mistaken for a withdrawn invite
async function respond(accept) {
    const id = shownInviteId;
    hideInvite();
    if (!id) return;
    if (dash) dash.invite = null;
    try {
        const result = await store.donor.respond(id, accept);
        if (result.status === 'QUOTA_FULL' || result.status === 'NOT_ELIGIBLE') toast(result.message);
        else toast(accept ? 'Slot dikunci untuk Anda. Tunjukkan QR tiket saat tiba.' : 'Terima kasih. Panggilan dialihkan ke pendonor cadangan.', accept ? 'success' : 'info');
    } catch (error) {
        toast(error.message, 'error');
    }
    load();
}

async function onMainClick(e) {
    const cancel = e.target.closest('[data-cancel]');
    const done = e.target.closest('[data-ack]');
    try {
        if (cancel) {
            if (!confirm('Batal datang? Slot Anda akan dialihkan ke pendonor lain.')) return;
            await store.donor.cancel(cancel.dataset.cancel);
            toast('Kedatangan dibatalkan. Terima kasih sudah memberi tahu.');
        } else if (done) {
            await store.donor.ack(done.dataset.ack);
        } else if (e.target.closest('[data-finish-recovery]')) {
            await store.donor.finishRecovery();
        } else {
            return;
        }
        load();
    } catch (error) {
        toast(error.message, 'error');
    }
}
