// initial data: 4 faskes, super admin + staff accounts, stock matrix, simulated donors. safe to run repeatedly.
// accounts are only created on first boot (empty users table): a default admin the operator deleted must not come back
import 'dotenv/config';
import { Component, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const DAY_MS = 86400000;
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const AREAS: Record<string, [number, number]> = {
  Gambir: [-6.176, 106.818], Menteng: [-6.196, 106.833], 'Cempaka Putih': [-6.178, 106.87], Senen: [-6.185, 106.845],
  Tebet: [-6.226, 106.853], Jatinegara: [-6.225, 106.875], 'Kebayoran Baru': [-6.244, 106.8], 'Pasar Minggu': [-6.285, 106.843],
  Cilandak: [-6.285, 106.8], 'Kelapa Gading': [-6.158, 106.905], Cengkareng: [-6.15, 106.735],
};

const FASKES = [
  { id: 'fk-tarakan', name: 'RSUD Tarakan', type: 'RS' as const, area: 'Gambir, Jakarta Pusat', lat: -6.1717, lng: 106.8106, email: 'tarakan@bloodsync.id' },
  { id: 'fk-hermina', name: 'RS Hermina Jatinegara', type: 'RS' as const, area: 'Jatinegara, Jakarta Timur', lat: -6.215, lng: 106.871, email: 'hermina@bloodsync.id' },
  { id: 'fk-fatmawati', name: 'RSUP Fatmawati', type: 'RS' as const, area: 'Cilandak, Jakarta Selatan', lat: -6.2925, lng: 106.793, email: 'fatmawati@bloodsync.id' },
  { id: 'fk-udd', name: 'UDD PMI DKI Jakarta', type: 'UDD' as const, area: 'Senen, Jakarta Pusat', lat: -6.1885, lng: 106.844, email: 'udd@bloodsync.id' },
];

// order follows BLOOD_TYPES: A+, A-, B+, B-, AB+, AB-, O+, O-
const STOCK: Record<string, Record<Component, number[]>> = {
  'fk-tarakan': { PRC: [0, 0, 1, 0, 1, 0, 1, 0], TC: [0, 0, 1, 0, 0, 0, 1, 0], WB: [0, 0, 0, 0, 0, 0, 1, 0] },
  'fk-hermina': { PRC: [1, 0, 0, 0, 0, 0, 1, 0], TC: [1, 0, 0, 0, 0, 0, 0, 0], WB: [0, 0, 1, 0, 0, 0, 0, 0] },
  'fk-fatmawati': { PRC: [2, 0, 1, 0, 0, 0, 2, 0], TC: [1, 0, 1, 0, 0, 0, 1, 0], WB: [1, 0, 0, 0, 0, 0, 1, 0] },
  'fk-udd': { PRC: [6, 1, 5, 1, 2, 0, 9, 1], TC: [3, 0, 2, 0, 1, 0, 4, 0], WB: [2, 0, 2, 0, 1, 0, 3, 1] },
};

// name, type, area, days since last donation (null = never), historical response rate
const DONORS: [string, string, string, number | null, number][] = [
  ['Rizky Pratama', 'A+', 'Menteng', 120, 0.8],
  ['Siti Rahmawati', 'A+', 'Tebet', 20, 0.7],
  ['Andi Saputra', 'O+', 'Gambir', 200, 0.6],
  ['Dewi Lestari', 'O+', 'Cempaka Putih', 90, 0.5],
  ['Bayu Nugroho', 'B+', 'Jatinegara', 75, 0.6],
  ['Putri Ayu', 'B+', 'Kebayoran Baru', null, 0.4],
  ['Fajar Hidayat', 'AB+', 'Menteng', 150, 0.5],
  ['Nadia Rahma', 'O-', 'Kelapa Gading', 300, 0.9],
  ['Hendra Wijaya', 'A-', 'Cilandak', 100, 0.6],
  ['Maya Sari', 'O+', 'Pasar Minggu', 45, 0.7],
  ['Yoga Permana', 'B-', 'Tebet', 180, 0.5],
  ['Intan Permata', 'A+', 'Cengkareng', 95, 0.6],
];

// dummy population registry: stands in for bpjs/dukcapil data, people who never opened the app
const RESIDENT_COUNT = 400;
const FIRST = ['Agus', 'Budi', 'Citra', 'Dian', 'Eka', 'Fitri', 'Gilang', 'Hana', 'Irfan', 'Joko', 'Kartika', 'Lina', 'Rudi', 'Nur', 'Oki', 'Prasetyo', 'Ratna', 'Sri', 'Taufik', 'Wulan', 'Yusuf', 'Zahra', 'Arif', 'Bella', 'Dimas', 'Indah', 'Reza', 'Tika'];
const LAST = ['Santoso', 'Wibowo', 'Kusuma', 'Siregar', 'Nasution', 'Hasibuan', 'Purnomo', 'Setiawan', 'Halim', 'Gunawan', 'Saputri', 'Lubis', 'Hakim', 'Susanto', 'Rahman', 'Utami'];
// rough indonesian distribution: O 37%, B 29%, A 26%, AB 8%, rhesus negative under 1%
const TYPE_WEIGHTS: [string, number][] = [['O+', 366], ['B+', 287], ['A+', 257], ['AB+', 79], ['O-', 4], ['B-', 3], ['A-', 3], ['AB-', 1]];

// deterministic, so re-running the seed yields the same people
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

function pickType(r: number) {
  const total = TYPE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let n = r * total;
  for (const [type, w] of TYPE_WEIGHTS) if ((n -= w) < 0) return type;
  return 'O+';
}

function residents() {
  const rand = rng(20261007);
  const areas = Object.entries(AREAS);
  return Array.from({ length: RESIDENT_COUNT }, (_, i) => {
    const [area, [lat, lng]] = areas[i % areas.length];
    // ages 15-70, so some fall outside the 17-60 donor range on purpose
    const birthDate = new Date(Date.UTC(new Date().getFullYear() - 15 - Math.floor(rand() * 56), Math.floor(rand() * 12), 1 + Math.floor(rand() * 28)));
    return {
      nik: '3171' + String(i).padStart(6, '0') + String(birthDate.getUTCFullYear()).slice(2) + '0001',
      name: `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`,
      birthDate,
      bloodType: pickType(rand()),
      address: `Jl. ${LAST[i % LAST.length]} No. ${1 + (i % 90)}, ${area}`,
      area,
      lat: lat + (rand() - 0.5) * 0.03,
      lng: lng + (rand() - 0.5) * 0.03,
      phone: '0899' + String(10000000 + i * 104729).slice(-8),
      isSimulated: true,
    };
  });
}

// every seeded account (super admin + faskes staff) starts with this password.
// it is a known default: replace these accounts before the app is reachable from the internet
const DEFAULT_PASSWORD = 'password';
const ADMIN_EMAIL = 'admin@bloodsync.id';

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';
  const firstBoot = (await prisma.user.count()) === 0;
  const passwordHash = firstBoot ? await bcrypt.hash(DEFAULT_PASSWORD, 12) : '';

  for (const f of FASKES) {
    const { email, ...data } = f;
    // existing rows keep the admin's edits; a deleted one is not recreated over a faskes that now has its name
    const exists = await prisma.faskes.findUnique({ where: { id: f.id }, select: { id: true } });
    if (!exists) {
      if (await prisma.faskes.findFirst({ where: { name: f.name }, select: { id: true } })) {
        console.log(`  Faskes "${f.name}" dilewati: nama sudah dipakai faskes lain.`);
        continue;
      }
      await prisma.faskes.create({ data });
    }
    if (firstBoot) await prisma.user.create({ data: { email, name: `Petugas ${f.name}`, passwordHash, role: 'FASKES_STAFF', faskesId: f.id } });
    for (const component of ['PRC', 'TC', 'WB'] as Component[]) {
      for (const [i, bloodType] of BLOOD_TYPES.entries()) {
        await prisma.stock.upsert({
          where: { faskesId_component_bloodType: { faskesId: f.id, component, bloodType } },
          create: { faskesId: f.id, component, bloodType, quantity: STOCK[f.id][component][i] },
          update: {},
        });
      }
    }
  }

  if (firstBoot) await prisma.user.create({ data: { email: ADMIN_EMAIL, name: 'Super Admin', passwordHash, role: 'SUPER_ADMIN' } });

  // dummy donors are demo data only; production starts with real registrations
  const hasUdd = !!(await prisma.faskes.findUnique({ where: { id: 'fk-udd' }, select: { id: true } }));
  for (const [i, [name, bloodType, area, daysAgo, responseRate]] of isProduction ? [] : DONORS.entries()) {
    const phone = '0812' + String(10000000 + i * 7919);
    const [lat, lng] = AREAS[area];
    const lastDonationAt = daysAgo === null ? null : new Date(Date.now() - daysAgo * DAY_MS);
    const exists = await prisma.donor.findUnique({ where: { phone } });
    if (exists) continue;
    const donor = await prisma.donor.create({
      data: {
        name, phone, bloodType, area, responseRate, lastDonationAt, isSimulated: true,
        lat: lat + ((i % 3) - 1) * 0.004, lng: lng + ((i % 5) - 2) * 0.003,
      },
    });
    if (lastDonationAt && hasUdd) {
      await prisma.donation.create({ data: { donorId: donor.id, faskesId: 'fk-udd', component: 'WB', donatedAt: lastDonationAt } });
      await prisma.donorBadge.create({ data: { donorId: donor.id, badgeId: 'first' } });
      if (bloodType.endsWith('-')) await prisma.donorBadge.create({ data: { donorId: donor.id, badgeId: 'rare' } });
    }
  }

  if (!isProduction) {
    await prisma.resident.createMany({ data: residents(), skipDuplicates: true });
    // a real phone for live demos: this person gets a real whatsapp call without ever signing up
    const demoPhone = process.env.DEMO_RESIDENT_PHONE?.replace(/\D/g, '').replace(/^62/, '0');
    if (demoPhone) {
      await prisma.resident.upsert({
        where: { phone: demoPhone },
        create: {
          nik: '3171019999990001', name: process.env.DEMO_RESIDENT_NAME || 'Peserta Demo', phone: demoPhone,
          birthDate: new Date(Date.UTC(2000, 0, 1)), bloodType: process.env.DEMO_RESIDENT_BLOOD || 'O+',
          address: 'Jl. Demo No. 1, Gambir', area: 'Gambir', lat: -6.1735, lng: 106.8135, isSimulated: false,
        },
        update: {},
      });
    }
  }

  console.log('Seed selesai.');
  if (firstBoot) {
    console.log(`  Super admin : ${ADMIN_EMAIL} / ${DEFAULT_PASSWORD}`);
    console.log(`  Petugas     : ${FASKES.map(f => f.email).join(' | ')} / ${DEFAULT_PASSWORD}`);
  } else {
    console.log('  Akun bawaan dilewati: tabel users sudah berisi akun (akun hanya dibuat saat database masih kosong).');
  }
  console.log(isProduction ? '  Pendonor dummy dilewati (production).' : `  Pendonor dummy: ${DONORS.length} (hanya development)`);
  if (!isProduction) console.log(`  Data penduduk dummy: ${await prisma.resident.count()} orang (dipanggil tanpa perlu daftar)`);
  if (isProduction && firstBoot) {
    console.warn('\n  !!! PERINGATAN: akun seed memakai kata sandi bawaan "password".');
    console.warn('  !!! Siapa pun bisa masuk sebagai super admin. Ganti akun ini sebelum aplikasi bisa diakses publik.\n');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
