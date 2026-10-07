import { Component, MovementKind, RequestStatus, TicketStatus, TransferStatus, Urgency } from '@prisma/client';

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodType = (typeof BLOOD_TYPES)[number];

export const COMPONENT_LABEL: Record<Component, string> = { PRC: 'PRC', TC: 'Trombosit', WB: 'Whole Blood' };

// indonesian labels, same wording as the frontend (store.js)
export const URGENCY_LABEL: Record<Urgency, string> = { KRITIS: 'Kritis', MENDESAK: 'Mendesak', TERJADWAL: 'Terjadwal' };
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING_VERIFICATION: 'Menunggu Verifikasi', APPROVED: 'Terverifikasi', BROADCASTING: 'Pencarian Donor',
  FULFILLED: 'Terpenuhi', CLOSED: 'Ditutup', REJECTED: 'Ditolak', EXPIRED: 'Kedaluwarsa',
};
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  INVITED: 'Diundang', DECLINED: 'Menolak', RESERVED: 'Menuju faskes', ARRIVED: 'Tiba', SCREENED: 'Lolos skrining',
  SCREENING_FAILED: 'Gagal skrining', COLLECTED: 'Darah diambil', NO_SHOW: 'Tidak datang', CANCELLED: 'Dibatalkan',
  WITHDRAWN: 'Undangan ditarik', QUOTA_FULL: 'Kuota penuh',
};
export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = { PENDING: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak', CANCELLED: 'Dibatalkan' };
export const MOVEMENT_KIND_LABEL: Record<MovementKind, string> = { IN: 'Masuk', OUT: 'Keluar', TRANSFER: 'Mutasi masuk' };

export const DISPATCH = {
  eligibilityDays: 60, // value from the spec; confirm against permenkes 91/2015 / local UDD before production
  overProvision: 3, // invite ~3x the uncovered need because most alerts go unanswered
  radiusStepKm: 5,
  maxRadiusKm: 15,
  maxAlertsPerWeek: 3,
  travelSpeedKmh: 20,
  reservationBufferMin: 30,
  lowStockThreshold: 2,
  // donor age range (permenkes 91/2015); applies to registry donors, whose birth date is known
  minAge: 17,
  maxAge: 60,
} as const;

export const SCREENING = { hbMin: 12.5, hbMax: 17, sysMin: 90, sysMax: 160, diaMin: 60, diaMax: 100, weightMin: 45 } as const;

// kecamatan presets stand in for gps, like the whatsapp bot registration flow
export const AREAS: Record<string, [number, number]> = {
  Gambir: [-6.176, 106.818],
  Menteng: [-6.196, 106.833],
  'Cempaka Putih': [-6.178, 106.87],
  Senen: [-6.185, 106.845],
  Tebet: [-6.226, 106.853],
  Jatinegara: [-6.225, 106.875],
  'Kebayoran Baru': [-6.244, 106.8],
  'Pasar Minggu': [-6.285, 106.843],
  Cilandak: [-6.285, 106.8],
  'Kelapa Gading': [-6.158, 106.905],
  Cengkareng: [-6.15, 106.735],
};

// red cell compatibility: recipient -> donor types that may be given
const RBC_COMPATIBLE: Record<BloodType, BloodType[]> = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
};

// identical type first; cross-type only for red cells, since platelets and whole blood need ABO-identical units
export function compatibleDonorTypes(recipient: string, component: Component, allowCompatible: boolean): string[] {
  if (component !== 'PRC' || !allowCompatible) return [recipient];
  return [recipient, ...RBC_COMPATIBLE[recipient as BloodType].filter(t => t !== recipient)];
}

export interface BadgeContext {
  donationCount: number;
  bloodType: string;
  responseMs: number | null;
}

export const BADGES: { id: string; label: string; icon: string; earned: (c: BadgeContext) => boolean }[] = [
  { id: 'first', label: 'Pahlawan Pertama', icon: 'fa-heart', earned: c => c.donationCount >= 1 },
  { id: 'bronze', label: '3x Donor', icon: 'fa-medal', earned: c => c.donationCount >= 3 },
  { id: 'silver', label: '5x Donor', icon: 'fa-award', earned: c => c.donationCount >= 5 },
  { id: 'gold', label: '10x Donor', icon: 'fa-crown', earned: c => c.donationCount >= 10 },
  { id: 'fast', label: 'Respons Kilat', icon: 'fa-bolt', earned: c => c.responseMs !== null && c.responseMs < 5 * 60000 },
  { id: 'rare', label: 'Rhesus Negatif', icon: 'fa-gem', earned: c => c.donationCount >= 1 && c.bloodType.endsWith('-') },
];
