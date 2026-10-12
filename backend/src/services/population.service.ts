import prisma from '../config/prisma';
import { env } from '../config/env';
import { DISPATCH } from '../constants/blood';
import { boundingBox, distanceKm, isValidPhone, normalizePhone } from '../utils/helpers';
import type { Tx } from './dispatch.service';

// one person from population data: enough to call them, nothing more
export interface Resident {
  nik: string;
  name: string;
  birthDate: Date;
  bloodType: string;
  area: string;
  lat: number;
  lng: number;
  phone: string;
  isSimulated: boolean;
}

// population data provider. dispatch only needs "who is near here" and "who owns this number"
interface PopulationSource {
  near(center: { lat: number; lng: number }, radiusKm: number, bloodTypes: string[]): Promise<Resident[]>;
  byPhone(phone: string): Promise<Resident | null>;
}

const select = { nik: true, name: true, birthDate: true, bloodType: true, area: true, lat: true, lng: true, phone: true, isSimulated: true } as const;

// residents table, filled with dummy data by the seed
const local: PopulationSource = {
  async near(center, radiusKm, bloodTypes) {
    const box = boundingBox(center, radiusKm);
    const rows = await prisma.resident.findMany({
      where: {
        bloodType: { in: bloodTypes },
        lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng },
        ...(env.isProduction ? { isSimulated: false } : {}),
      },
      select,
    });
    return rows.filter(r => distanceKm(center, r) <= radiusKm);
  },
  byPhone: phone => prisma.resident.findFirst({ where: { phone, ...(env.isProduction ? { isSimulated: false } : {}) }, select }),
};

// any institution holding population data (dukcapil, bpjs, pmi, satu data, ...) behind an http api.
// expected contract below; an institution with a different format only needs its own mapResident.
// needs a data-sharing agreement and a legal basis under uu pdp before it may be switched on
//   GET {url}/residents?lat=&lng=&radiusKm=&bloodTypes=A+,O+   -> [{ nik, name, birthDate, bloodType, area, lat, lng, phone }]
//   GET {url}/residents/by-phone/{phone}                       -> same object, or 404
function mapResident(raw: Record<string, unknown>): Resident {
  return {
    nik: String(raw.nik), name: String(raw.name), birthDate: new Date(String(raw.birthDate)),
    bloodType: String(raw.bloodType), area: String(raw.area || ''), lat: Number(raw.lat), lng: Number(raw.lng),
    phone: normalizePhone(String(raw.phone)), isSimulated: false,
  };
}

async function call(path: string) {
  if (!env.populationApiUrl) throw new Error('POPULATION_API_URL belum diisi');
  const res = await fetch(`${env.populationApiUrl}${path}`, {
    headers: { Authorization: `Bearer ${env.populationApiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`api data penduduk: ${res.status}`);
  return res.json();
}

const external: PopulationSource = {
  async near(center, radiusKm, bloodTypes) {
    const q = new URLSearchParams({ lat: String(center.lat), lng: String(center.lng), radiusKm: String(radiusKm), bloodTypes: bloodTypes.join(',') });
    const rows = ((await call(`/residents?${q}`)) || []) as Record<string, unknown>[];
    return rows.map(mapResident).filter(r => isValidPhone(r.phone) && bloodTypes.includes(r.bloodType));
  },
  async byPhone(phone) {
    const raw = await call(`/residents/by-phone/${encodeURIComponent(phone)}`);
    return raw ? mapResident(raw) : null;
  },
};

const source = () => (env.populationSource === 'external' ? external : local);

export function ageOf(birthDate: Date, now = new Date()) {
  let age = now.getFullYear() - birthDate.getFullYear();
  const m = now.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

export const ageAllowed = (birthDate: Date | null, now = new Date()) =>
  !birthDate || (ageOf(birthDate, now) >= DISPATCH.minAge && ageOf(birthDate, now) <= DISPATCH.maxAge);

const toDonor = (r: Resident) => ({
  name: r.name, phone: r.phone, bloodType: r.bloodType, area: r.area, lat: r.lat, lng: r.lng,
  birthDate: r.birthDate, isSimulated: r.isSimulated, source: 'REGISTRY' as const,
});

// turns nearby residents into donor rows so the regular dispatch flow (tickets, whatsapp, "1"/"2" replies) covers them.
// people who already have a donor row keep it untouched, an opted-out (inactive) one stays opted out.
// a failing source must not stop the wave: registered donors are still invited
export async function enlistNearby(tx: Tx, center: { lat: number; lng: number }, radiusKm: number, bloodTypes: string[]) {
  if (!env.enableRegistry) return 0;
  let residents: Resident[];
  try {
    residents = (await source().near(center, radiusKm, bloodTypes)).filter(r => ageAllowed(r.birthDate));
  } catch (err) {
    console.error('[registry] gagal membaca data penduduk', (err as Error).message);
    return 0;
  }
  if (!residents.length) return 0;
  const known = new Set((await tx.donor.findMany({ where: { phone: { in: residents.map(r => r.phone) } }, select: { phone: true } })).map(d => d.phone));
  const fresh = residents.filter(r => !known.has(r.phone));
  if (!fresh.length) return 0;
  const { count } = await tx.donor.createMany({ data: fresh.map(toDonor), skipDuplicates: true });
  return count;
}

// otp login by someone the registry knows: their donor profile is made on the spot, no sign-up form
export async function enlistByPhone(phone: string) {
  if (!env.enableRegistry) return null;
  let r: Resident | null;
  try {
    r = await source().byPhone(phone);
  } catch (err) {
    console.error('[registry] gagal mencari nomor di data penduduk', (err as Error).message);
    return null;
  }
  if (!r || !ageAllowed(r.birthDate)) return null;
  return prisma.donor.upsert({ where: { phone }, create: toDonor(r), update: {} });
}
