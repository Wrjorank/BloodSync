// demo data: 4 faskes, staff accounts, stock matrix, simulated donors. safe to run repeatedly.
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

async function main() {
  const staffHash = await bcrypt.hash('Petugas#1234', 10);
  const adminHash = await bcrypt.hash('Admin#1234', 10);

  for (const f of FASKES) {
    const { email, ...data } = f;
    await prisma.faskes.upsert({ where: { id: f.id }, create: data, update: data });
    await prisma.user.upsert({
      where: { email },
      create: { email, name: `Petugas ${f.name}`, passwordHash: staffHash, role: 'FASKES_STAFF', faskesId: f.id },
      update: {},
    });
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

  await prisma.user.upsert({
    where: { email: 'admin@bloodsync.id' },
    create: { email: 'admin@bloodsync.id', name: 'Super Admin', passwordHash: adminHash, role: 'SUPER_ADMIN' },
    update: {},
  });

  for (const [i, [name, bloodType, area, daysAgo, responseRate]] of DONORS.entries()) {
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
    if (lastDonationAt) {
      await prisma.donation.create({ data: { donorId: donor.id, faskesId: 'fk-udd', component: 'WB', donatedAt: lastDonationAt } });
      await prisma.donorBadge.create({ data: { donorId: donor.id, badgeId: 'first' } });
      if (bloodType.endsWith('-')) await prisma.donorBadge.create({ data: { donorId: donor.id, badgeId: 'rare' } });
    }
  }

  console.log('Seed selesai.');
  console.log('  Super admin : admin@bloodsync.id / Admin#1234');
  console.log('  Petugas     : tarakan@bloodsync.id | hermina@bloodsync.id | fatmawati@bloodsync.id | udd@bloodsync.id / Petugas#1234');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
