import crypto from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DAY_MS = 86400000;

export function randomCode(length: number): string {
  return Array.from({ length }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
}

export function randomDigits(length: number): string {
  return Array.from({ length }, () => crypto.randomInt(10)).join('');
}

export function normalizePhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.startsWith('62') ? '0' + digits.slice(2) : digits;
}

export const isValidPhone = (phone: string) => /^08\d{8,11}$/.test(phone);

// haversine distance between two {lat, lng} points
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// lat/lng box that contains the radius, used to prefilter donors in sql before exact haversine
export function boundingBox(center: { lat: number; lng: number }, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  return { minLat: center.lat - dLat, maxLat: center.lat + dLat, minLng: center.lng - dLng, maxLng: center.lng + dLng };
}

export function maskName(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + '***').join(' ');
}

export function maskPhone(phone: string): string {
  return phone.length > 7 ? `${phone.slice(0, 4)}****${phone.slice(-3)}` : phone;
}

export function eligibility(lastDonationAt: Date | null, eligibilityDays: number, now = Date.now()) {
  if (!lastDonationAt) return { eligible: true, nextDate: null as Date | null, daysLeft: 0 };
  const next = lastDonationAt.getTime() + eligibilityDays * DAY_MS;
  const daysLeft = Math.ceil((next - now) / DAY_MS);
  return { eligible: daysLeft <= 0, nextDate: new Date(next), daysLeft: Math.max(0, daysLeft) };
}
