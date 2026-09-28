import { BloodRequest, DispatchWave, DonorTicket, Faskes, RequestEvent } from '@prisma/client';
import { COMPONENT_LABEL } from '../constants/blood';
import { maskName, maskPhone } from '../utils/helpers';
import { ACTIVE_TICKET, Progress, publicState } from './dispatch.service';

type TicketWithDonor = DonorTicket & { donor: { id: string; name: string; bloodType: string } };

export function dispatchOf(req: BloodRequest, waves: DispatchWave[]) {
  if (!req.dispatchStartedAt) return null;
  const current = waves.find(w => w.wave === req.wave) || null;
  return {
    startedAt: req.dispatchStartedAt,
    wave: req.wave,
    radiusKm: req.radiusKm,
    waveStartedAt: req.waveStartedAt,
    nextEscalationAt: req.waveStartedAt ? new Date(req.waveStartedAt.getTime() + (req.escalateMinutes || 10) * 60000) : null,
    escalateMinutes: req.escalateMinutes,
    deadline: req.deadline,
    allowCompatible: req.allowCompatible,
    maxedOut: req.maxedOut,
    funnel: current && {
      inRadius: current.inRadius, typeMatch: current.typeMatch, eligible: current.eligible, capped: current.capped, invited: current.invited,
    },
    waves: waves.map(w => ({ wave: w.wave, radiusKm: w.radiusKm, invited: w.invited })),
  };
}

function base(req: BloodRequest, p: Progress) {
  return {
    id: req.id,
    code: req.code,
    status: req.status,
    bloodType: req.bloodType,
    component: req.component,
    componentLabel: COMPONENT_LABEL[req.component],
    bagsNeeded: req.bagsNeeded,
    urgency: req.urgency,
    progress: p,
    publicState: publicState(req, p),
    createdAt: req.createdAt,
    updatedAt: req.updatedAt,
  };
}

// staff see identities (needed for verification) but not the family's full phone number
export function forStaff(req: BloodRequest & { waves: DispatchWave[]; events: RequestEvent[]; tickets: TicketWithDonor[] }, p: Progress) {
  return {
    ...base(req, p),
    patientName: req.patientName,
    medicalRecordNo: req.medicalRecordNo,
    ward: req.ward,
    phone: maskPhone(req.phone),
    letter: req.letterPath ? { name: req.letterName, mime: req.letterMime } : null,
    rejectReason: req.rejectReason,
    dispatch: dispatchOf(req, req.waves),
    tickets: req.tickets.map(t => ({
      id: t.id, code: t.code, status: t.status, wave: t.wave, distanceKm: t.distanceKm, etaMin: t.etaMin,
      invitedAt: t.invitedAt, respondedAt: t.respondedAt, reservedUntil: t.reservedUntil, arrivedAt: t.arrivedAt, collectedAt: t.collectedAt,
      donor: { id: t.donor.id, name: t.donor.name, bloodType: t.donor.bloodType },
    })),
    events: req.events.map(e => ({ at: e.createdAt, text: e.text })),
  };
}

// family sees donors on the way only as masked names
export function forFamily(req: BloodRequest & { faskes: Faskes; waves: DispatchWave[]; events: RequestEvent[]; tickets: TicketWithDonor[] }, p: Progress) {
  return {
    ...base(req, p),
    patientName: req.patientName,
    ward: req.ward,
    rejectReason: req.rejectReason,
    faskes: { id: req.faskes.id, name: req.faskes.name, area: req.faskes.area },
    dispatch: dispatchOf(req, req.waves),
    publicToken: req.status === 'BROADCASTING' || req.status === 'FULFILLED' ? req.publicToken : null,
    enRoute: req.tickets
      .filter(t => ACTIVE_TICKET.includes(t.status))
      .map(t => ({ name: maskName(t.donor.name), bloodType: t.donor.bloodType, status: t.status, etaMin: t.etaMin })),
    events: req.events.map(e => ({ at: e.createdAt, text: e.text })),
  };
}

// public card: no identities, no contact data
export function forPublic(req: BloodRequest & { faskes: Faskes }, p: Progress) {
  return {
    code: req.code,
    state: publicState(req, p),
    bloodType: req.bloodType,
    component: req.component,
    componentLabel: COMPONENT_LABEL[req.component],
    urgency: req.urgency,
    patient: maskName(req.patientName),
    faskes: { name: req.faskes.name, area: req.faskes.area, lat: req.faskes.lat, lng: req.faskes.lng, type: req.faskes.type },
    needed: p.needed,
    fulfilled: p.fulfilled,
    donorsOnTheWay: p.reserved,
    deadline: req.deadline,
    updatedAt: req.updatedAt,
  };
}
