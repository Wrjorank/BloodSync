// kartu.js — public emergency card; status is read live from the api, so a forwarded link can never go stale
const STATE = {
    OPEN: ['DIBUKA', 'bg-green-50 border-green-200 text-green-800', 'fa-circle-dot', 'Masih membutuhkan pendonor. Pastikan Anda sehat, lalu datang ke UDD faskes.'],
    QUOTA_FULL: ['KUOTA PENUH', 'bg-amber-50 border-amber-200 text-amber-800', 'fa-person-walking-arrow-right', 'Pendonor yang dibutuhkan sudah dalam perjalanan. Mohon jangan datang dulu.'],
    FULFILLED: ['CLOSED', 'bg-slate-100 border-slate-200 text-slate-700', 'fa-lock', 'Kebutuhan sudah terpenuhi. Mohon hentikan penyebaran pesan ini.'],
    CLOSED: ['CLOSED', 'bg-slate-100 border-slate-200 text-slate-700', 'fa-lock', 'Permintaan sudah ditutup faskes. Mohon hentikan penyebaran pesan ini.'],
    EXPIRED: ['KEDALUWARSA', 'bg-slate-100 border-slate-200 text-slate-700', 'fa-clock', 'Batas waktu panggilan sudah lewat. Mohon hentikan penyebaran pesan ini.'],
    PENDING: ['BELUM AKTIF', 'bg-slate-100 border-slate-200 text-slate-700', 'fa-hourglass-half', 'Permintaan belum diverifikasi faskes.']
};

document.addEventListener('DOMContentLoaded', () => {
    const token = new URLSearchParams(location.search).get('t') || '';
    startCountdowns();
    if (!/^[A-Z2-9]{16}$/.test(token)) {
        document.getElementById('card').innerHTML = invalidView();
        return;
    }
    subscribe(null, () => render(token), { cardToken: token, pollMs: 30000 });
    render(token);
});

async function render(token) {
    const card = document.getElementById('card');
    let c;
    try {
        c = await store.card(token);
    } catch (error) {
        if (error.status === 404) card.innerHTML = invalidView();
        else toast(error.message, 'error');
        return;
    }
    const p = { needed: c.needed, fulfilled: c.fulfilled, reserved: c.donorsOnTheWay, remaining: Math.max(0, c.needed - c.fulfilled) };
    const [label, tone, icon, message] = STATE[c.state];
    const locked = ['FULFILLED', 'CLOSED', 'EXPIRED'].includes(c.state);
    const deadline = c.deadline ? fmtDeadline(c.deadline) : '—';

    card.innerHTML = `
        <article class="relative bg-white rounded-[2rem] overflow-hidden shadow-2xl">
            <div class="bg-gradient-to-br ${locked ? 'from-slate-500 to-slate-700' : 'from-brand-600 to-rose-800'} text-white px-6 pt-6 pb-8">
                <div class="flex items-center justify-between gap-2">
                    <span class="font-extrabold tracking-tight flex items-center gap-2"><i class="fa-solid fa-droplet"></i> BloodSync</span>
                    <span class="text-[11px] font-bold bg-white/15 border border-white/25 px-2.5 py-1 rounded-full whitespace-nowrap"><i class="fa-solid fa-circle-check mr-1"></i>Terverifikasi faskes</span>
                </div>
                <p class="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-white/70">Panggilan donor darah</p>
                <div class="flex items-end gap-3 mt-2">
                    <span class="text-7xl font-extrabold leading-none">${esc(c.bloodType)}</span>
                    <span class="text-lg font-bold mb-1">${esc(c.componentLabel)}</span>
                </div>
                <p class="mt-3 text-sm text-white/85"><i class="fa-solid fa-hospital mr-1"></i> ${esc(c.faskes.name)} • ${esc(c.faskes.area)}</p>
            </div>

            <div class="px-6 py-5 space-y-4">
                <div class="${tone} border rounded-2xl px-4 py-3">
                    <div class="font-extrabold tracking-wider text-sm"><i class="fa-solid ${icon} mr-1"></i> ${label}</div>
                    <div class="text-xs mt-1 leading-relaxed">${message}</div>
                </div>

                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="bg-slate-50 rounded-xl py-2.5"><div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Kebutuhan</div><div class="font-extrabold text-slate-900">${c.needed} ktg</div></div>
                    <div class="bg-slate-50 rounded-xl py-2.5"><div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Terpenuhi</div><div class="font-extrabold text-green-600">${c.fulfilled} ktg</div></div>
                    <div class="bg-slate-50 rounded-xl py-2.5"><div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Berlaku s.d.</div><div class="font-extrabold text-slate-900">${deadline}</div></div>
                </div>
                ${progressBar(p)}

                <div class="flex items-center gap-4 pt-1">
                    <div id="cardQr" class="shrink-0 p-1.5 border border-slate-100 rounded-xl"></div>
                    <div class="text-xs text-slate-500 leading-relaxed">
                        <div class="font-semibold text-slate-700 mb-0.5">Pindai untuk cek keaslian</div>
                        QR membuka halaman resmi ini. Status selalu diambil langsung dari inventaris faskes.
                        <div class="mt-1 text-slate-400">Pasien: ${esc(c.patient)} • ${esc(c.code)}</div>
                    </div>
                </div>

                ${c.state === 'OPEN' ? `
                    <a href="pendonor.html" class="block w-full text-center bg-brand-600 text-white font-bold py-3.5 rounded-xl hover:bg-brand-700 shadow-lg shadow-brand-500/30">
                        Saya bisa donor <i class="fa-solid fa-arrow-right ml-1"></i>
                    </a>
                    <p class="text-[11px] text-slate-400 text-center">Daftar dulu agar slot Anda dikunci dan tidak datang sia-sia.</p>` : ''}
            </div>

            ${locked ? `
                <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span class="border-[6px] border-red-600/80 text-red-600/80 font-black ${label.length > 7 ? 'text-4xl' : 'text-6xl'} tracking-widest px-6 py-2 rounded-2xl -rotate-12 bg-white/60">${label}</span>
                </div>` : ''}
        </article>`;
    renderQR(document.getElementById('cardQr'), location.href, 88);
}

function invalidView() {
    return `
        <div class="bg-white rounded-[2rem] p-8 text-center shadow-2xl">
            <div class="w-16 h-16 mx-auto rounded-full bg-red-100 text-red-600 flex items-center justify-center text-2xl mb-4"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <h1 class="font-extrabold text-xl text-slate-900">Tautan tidak dikenali</h1>
            <p class="text-sm text-slate-500 mt-2">Kartu ini tidak terdaftar di sistem faskes. Kemungkinan pesan palsu atau sudah dihapus. Jangan sebarkan dan jangan transfer uang atas nama permintaan darah.</p>
            <a href="index.html" class="inline-block mt-6 text-sm font-semibold text-brand-600 hover:underline">Ke beranda BloodSync</a>
        </div>`;
}
