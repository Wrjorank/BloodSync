// pasien.js — patient family: otp-verified request with doctor's letter + live tracker
const pending = { phone: null };
const seen = { status: null, fulfilled: null };
let current = null;
let unsubscribe = null;
let renderSeq = 0;

const HEADER = {
    PENDING_VERIFICATION: ['fa-hourglass-half', 'bg-orange-100 text-orange-500', 'Menunggu Verifikasi', 'Petugas faskes sedang memeriksa surat pengantar dokter.'],
    APPROVED: ['fa-clipboard-check', 'bg-amber-100 text-amber-600', 'Terverifikasi', 'Faskes sedang mengecek stok internal dan faskes terdekat.'],
    BROADCASTING: ['fa-satellite-dish animate-pulse', 'bg-blue-100 text-blue-500', 'Pencarian Donor Aktif', 'Notifikasi dikirim hanya ke pendonor yang cocok di sekitar faskes.'],
    FULFILLED: ['fa-circle-check', 'bg-green-100 text-green-600', 'Kebutuhan Terpenuhi', 'Semua kantong sudah tersedia. Kartu publik otomatis dikunci (CLOSED).'],
    REJECTED: ['fa-circle-xmark', 'bg-red-100 text-red-600', 'Pengajuan Ditolak', ''],
    EXPIRED: ['fa-clock', 'bg-slate-100 text-slate-500', 'Batas Waktu Terlewati', 'Hubungi petugas faskes untuk memperpanjang panggilan.'],
    CLOSED: ['fa-lock', 'bg-slate-100 text-slate-500', 'Pengajuan Ditutup', 'Permintaan ini sudah tidak aktif.']
};
const STEPS = ['Diajukan', 'Diverifikasi', 'Cari donor', 'Terpenuhi'];
const STEP_INDEX = { PENDING_VERIFICATION: 0, APPROVED: 1, BROADCASTING: 2, FULFILLED: 3, REJECTED: 0, EXPIRED: 2, CLOSED: 0 };

document.addEventListener('DOMContentLoaded', () => {
    store.faskesList()
        .then(list => {
            document.getElementById('reqFaskes').innerHTML = list.filter(f => f.type === 'RS')
                .map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
        })
        .catch(err => toast(err.message, 'error'));
    document.getElementById('btnSendOtp').addEventListener('click', sendOtp);
    document.getElementById('btnVerifyOtp').addEventListener('click', verifyOtp);
    document.getElementById('reqLetter').addEventListener('change', onLetterPicked);
    document.getElementById('requestForm').addEventListener('submit', onSubmit);
    document.getElementById('btnCancel').addEventListener('click', cancelRequest);
    document.getElementById('btnNew').addEventListener('click', () => {
        session.patch('family', { requestId: null });
        render();
    });
    document.getElementById('shareCopy').addEventListener('click', copyLink);
    document.getElementById('shareStory').addEventListener('click', () => {
        if (!current?.publicToken) return;
        downloadStory({
            bloodType: current.bloodType, componentLabel: current.componentLabel, faskesName: current.faskes.name, faskesArea: current.faskes.area,
            needed: current.progress.needed, fulfilled: current.progress.fulfilled, deadline: current.dispatch?.deadline ? fmtDeadline(current.dispatch.deadline) : '',
            url: publicUrl(current), code: current.code, patient: maskName(current.patientName)
        }).catch(err => toast(err.message || 'Gagal membuat gambar.', 'error'));
    });

    startCountdowns();
    onSessionEnd('family', () => {
        if (!unsubscribe) return;
        endSession();
        toast('Sesi berakhir, silakan masuk kembali.', 'error');
    });
    if (session.get('family')) watch();
    render();
});

// one live subscription per verified session
function watch() {
    unsubscribe?.();
    unsubscribe = subscribe('family', render);
}

// session expired or cleared in another tab: back to an unverified, empty form
function endSession() {
    unsubscribe?.();
    unsubscribe = null;
    renderSeq++; // drop any tracker fetch still in flight
    session.clear('family');
    current = null;
    seen.status = null;
    seen.fulfilled = null;
    const input = document.getElementById('reqPhone');
    input.readOnly = false;
    input.value = '';
    document.getElementById('reqOtp').value = '';
    document.getElementById('otpRow').classList.add('hidden');
    document.getElementById('btnSendOtp').classList.remove('hidden');
    document.getElementById('otpVerified').classList.add('hidden');
    showView('formView');
}

function showVerified(phone) {
    const input = document.getElementById('reqPhone');
    input.value = phone;
    input.readOnly = true;
    document.getElementById('otpRow').classList.add('hidden');
    document.getElementById('btnSendOtp').classList.add('hidden');
    document.getElementById('otpVerified').classList.remove('hidden');
}

async function sendOtp() {
    const phone = document.getElementById('reqPhone').value;
    await whileBusy(document.getElementById('btnSendOtp'), async () => {
        try {
            await store.requestOtp(phone, 'FAMILY');
            pending.phone = phone;
            document.getElementById('otpRow').classList.remove('hidden');
            document.getElementById('reqOtp').focus();
            toast('Kode OTP dikirim ke WhatsApp Anda.');
        } catch (error) {
            toast(error.message, 'error');
        }
    });
}

async function verifyOtp() {
    await whileBusy(document.getElementById('btnVerifyOtp'), async () => {
        try {
            const result = await store.verifyOtp(pending.phone, 'FAMILY', document.getElementById('reqOtp').value.trim());
            session.set('family', { token: result.token, phone: normalizePhone(pending.phone), requestId: null });
            showVerified(normalizePhone(pending.phone));
            watch();
            // resume an active request made earlier from this number
            const mine = await store.family.list();
            const active = mine.find(r => ACTIVE_REQUEST.includes(r.status));
            if (active) {
                session.patch('family', { requestId: active.id });
                toast(`Melanjutkan pengajuan aktif ${active.code}.`);
                render();
            }
        } catch (error) {
            if (error.status !== 401) toast(error.message, 'error');
        }
    });
}

function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.startsWith('62') ? '0' + digits.slice(2) : digits;
}

function onLetterPicked(e) {
    const file = e.target.files[0];
    const preview = document.getElementById('letterPreview');
    preview.classList.toggle('hidden', !file);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        toast('Ukuran berkas maksimal 5 MB.', 'error');
        e.target.value = '';
        preview.classList.add('hidden');
        return;
    }
    document.getElementById('letterName').textContent = file.name;
    const thumb = document.getElementById('letterThumb');
    thumb.classList.toggle('hidden', !file.type.startsWith('image/'));
    if (file.type.startsWith('image/')) thumb.src = URL.createObjectURL(file);
}

async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (!session.get('family')) return toast('Verifikasi nomor WhatsApp terlebih dahulu.', 'error');
    if (!form.checkValidity()) return form.reportValidity();
    const letter = document.getElementById('reqLetter').files[0];
    if (!letter) return toast('Lampirkan foto surat pengantar dokter.', 'error');

    const body = new FormData();
    body.append('patientName', document.getElementById('reqPatientName').value.trim());
    body.append('medicalRecordNo', document.getElementById('reqRm').value.trim());
    body.append('ward', document.getElementById('reqWard').value.trim());
    body.append('faskesId', document.getElementById('reqFaskes').value);
    body.append('bloodType', document.getElementById('reqAbo').value + document.getElementById('reqRh').value);
    body.append('component', document.getElementById('reqComponent').value);
    body.append('bagsNeeded', document.getElementById('reqBags').value);
    body.append('urgency', form.querySelector('input[name="urgency"]:checked').value);
    body.append('letter', letter);

    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    try {
        const created = await store.family.create(body);
        session.patch('family', { requestId: created.id });
        form.reset();
        document.getElementById('letterPreview').classList.add('hidden');
        toast('Pengajuan terkirim. Menunggu verifikasi faskes.', 'success');
        render();
    } catch (error) {
        toast(error.message, 'error');
    } finally {
        button.disabled = false;
    }
}

function showView(id) {
    document.getElementById('formView').classList.toggle('hidden', id !== 'formView');
    document.getElementById('trackerView').classList.toggle('hidden', id !== 'trackerView');
}

// poll, socket and post-action renders overlap, so only the newest fetch may paint
async function render() {
    const seq = ++renderSeq;
    const s = session.get('family');
    if (s?.phone) showVerified(s.phone);
    if (!s?.requestId) {
        current = null;
        showView('formView');
        return;
    }
    try {
        const req = await store.family.get(s.requestId);
        if (seq !== renderSeq) return;
        current = req;
        showView('trackerView');
        renderTracker(current);
    } catch (error) {
        if (seq !== renderSeq) return;
        if (error.status === 401) return endSession();
        if (error.status === 404) {
            session.patch('family', { requestId: null });
            return render();
        }
        toast(error.message, 'error');
    }
}

// live tracker: status, progress (secured vs. en-route), donors on the way, share card
function renderTracker(req) {
    const p = req.progress;
    announceChanges(req, p);

    let [icon, tone, title, desc] = HEADER[req.status];
    if (req.status === 'REJECTED') desc = `Alasan: ${req.rejectReason}. Silakan perbaiki dan ajukan ulang.`;
    if (req.publicState === 'QUOTA_FULL') desc = 'Pendonor yang dibutuhkan sudah dalam perjalanan. Notifikasi ke pendonor lain ditarik.';
    const iconEl = document.getElementById('trackerIcon');
    iconEl.className = `w-16 h-16 mx-auto rounded-full flex items-center justify-center text-2xl mb-3 ${tone}`;
    iconEl.innerHTML = `<i class="fa-solid ${icon}"></i>`;
    document.getElementById('trackerTitle').textContent = title;
    document.getElementById('trackerDesc').textContent = desc;

    const step = STEP_INDEX[req.status];
    const failed = ['REJECTED', 'EXPIRED', 'CLOSED'].includes(req.status);
    document.getElementById('timeline').innerHTML = STEPS.map((label, i) => {
        const done = i < step || (i === step && req.status === 'FULFILLED');
        const active = i === step && !done;
        const dot = done ? 'bg-green-500 text-white' : active ? (failed ? 'bg-red-500 text-white' : 'bg-brand-600 text-white') : 'bg-slate-100 text-slate-400';
        return `
            <li class="flex flex-col items-center gap-1.5">
                <span class="w-7 h-7 rounded-full ${dot} flex items-center justify-center text-xs font-bold">${done ? '<i class="fa-solid fa-check"></i>' : i + 1}</span>
                <span class="text-[11px] font-semibold ${done || active ? 'text-slate-700' : 'text-slate-400'}">${label}</span>
            </li>`;
    }).join('');

    document.getElementById('cardCode').textContent = req.code;
    document.getElementById('cardNeed').textContent = `${req.bloodType} • ${req.componentLabel}`;
    document.getElementById('cardProgressText').textContent = `${p.fulfilled} / ${p.needed} kantong`;
    document.getElementById('cardProgressBar').innerHTML = progressBar(p);

    document.getElementById('enRoute').innerHTML = req.enRoute.map(d => {
        const label = d.status === 'RESERVED' ? `Sedang menuju RS • ETA ${d.etaMin} mnt` : TICKET_STATUS[d.status];
        return `
            <div class="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><i class="fa-solid ${d.status === 'RESERVED' ? 'fa-person-walking-arrow-right' : 'fa-user-check'} text-sm"></i></div>
                <div class="min-w-0">
                    <div class="text-sm font-semibold text-slate-700">${esc(d.name)} <span class="text-slate-400 font-normal">• ${esc(d.bloodType)}</span></div>
                    <div class="text-[11px] text-blue-700">${label}</div>
                </div>
            </div>`;
    }).join('');

    const rows = [
        ['Pasien', req.patientName],
        ['Rumah sakit', req.faskes.name],
        ['Ruang', req.ward],
        ...(p.fromStock ? [['Dari stok faskes', `${p.fromStock} kantong`]] : []),
        ...(p.collected ? [['Dari pendonor', `${p.collected} kantong`]] : [])
    ];
    document.getElementById('cardDetails').innerHTML = rows.map(([k, v]) => `
        <div class="flex justify-between gap-3"><dt>${k}</dt><dd class="font-semibold text-slate-700 text-right">${esc(v)}</dd></div>`).join('') +
        (req.status === 'BROADCASTING' ? `
        <div class="flex justify-between gap-3"><dt>Batas waktu panggilan</dt><dd class="font-semibold text-slate-700">${fmtDeadline(req.dispatch.deadline)} (${countdown(req.dispatch.deadline)})</dd></div>
        <div class="flex justify-between gap-3"><dt>Radius pencarian</dt><dd class="font-semibold text-slate-700">${req.dispatch.radiusKm} km • gelombang ${req.dispatch.wave}</dd></div>` : '');

    renderShare(req);

    document.getElementById('historyList').innerHTML = [...req.events].reverse().map(h => `
        <li class="flex gap-3 text-xs"><span class="text-slate-400 shrink-0 tabular-nums">${fmtTime(h.at)}</span><span class="text-slate-600">${esc(h.text)}</span></li>`).join('');

    const active = ACTIVE_REQUEST.includes(req.status);
    document.getElementById('btnCancel').classList.toggle('hidden', !active);
    document.getElementById('btnNew').classList.toggle('hidden', active);
}

function publicUrl(req) {
    return new URL(`kartu.html?t=${req.publicToken}`, location.href).href;
}

function renderShare(req) {
    const show = (req.status === 'APPROVED' || req.status === 'BROADCASTING') && req.publicToken;
    document.getElementById('shareSection').classList.toggle('hidden', !show);
    if (!show) return;
    const url = publicUrl(req);
    const text = [
        'PANGGILAN DONOR DARAH (terverifikasi faskes)',
        `${req.faskes.name} membutuhkan ${req.progress.needed} kantong ${req.componentLabel} golongan ${req.bloodType}.`,
        `Terpenuhi: ${req.progress.fulfilled} kantong${req.dispatch?.deadline ? ` | Berlaku hingga ${fmtDeadline(req.dispatch.deadline)}` : ''}`,
        `Cek status real-time sebelum datang: ${url}`
    ].join('\n');
    document.getElementById('shareOpen').href = url;
    document.getElementById('shareWa').href = 'https://wa.me/?text=' + encodeURIComponent(text);
    document.getElementById('shareHint').className = req.dispatch?.maxedOut
        ? 'bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3 ring-2 ring-amber-200'
        : 'bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3';
}

async function copyLink() {
    if (!current?.publicToken) return;
    try {
        await navigator.clipboard.writeText(publicUrl(current));
        toast('Tautan kartu disalin.', 'success');
    } catch {
        prompt('Salin tautan ini:', publicUrl(current));
    }
}

// toast + os notification when the request moves forward
function announceChanges(req, p) {
    if (seen.status && seen.status !== req.status) {
        const messages = {
            APPROVED: 'Pengajuan diverifikasi faskes.',
            BROADCASTING: 'Panggilan darurat aktif. Sebarkan Kartu Darurat bila perlu.',
            FULFILLED: 'Kebutuhan darah terpenuhi. Tautan publik sudah dikunci.',
            REJECTED: 'Pengajuan ditolak faskes.',
            EXPIRED: 'Batas waktu panggilan terlewati.'
        };
        if (messages[req.status]) {
            toast(messages[req.status], req.status === 'REJECTED' ? 'error' : 'success');
            systemNotify('BloodSync', messages[req.status]);
        }
    } else if (seen.fulfilled !== null && p.fulfilled > seen.fulfilled) {
        toast(`${p.fulfilled} dari ${p.needed} kantong terpenuhi.`, 'success');
    }
    seen.status = req.status;
    seen.fulfilled = p.fulfilled;
}

async function cancelRequest() {
    if (!current || !confirm('Batalkan pengajuan ini? Pendonor yang sedang menuju akan diberi tahu.')) return;
    try {
        await store.family.cancel(current.id);
        render();
    } catch (error) {
        toast(error.message, 'error');
    }
}
