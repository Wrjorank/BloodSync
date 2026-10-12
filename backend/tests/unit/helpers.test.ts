import { describe, expect, it } from 'vitest';
import { DAY_MS, distanceKm, eligibility, maskPhone, normalizePhone } from '../../src/utils/helpers';

describe('eligibility', () => {
  const now = Date.UTC(2026, 9, 12);

  it('treats someone who never donated as eligible', () => {
    expect(eligibility(null, 60, now)).toMatchObject({ eligible: true, daysLeft: 0 });
  });

  it('blocks a donor inside the recovery window and counts the days left', () => {
    const r = eligibility(new Date(now - 10 * DAY_MS), 60, now);
    expect(r.eligible).toBe(false);
    expect(r.daysLeft).toBe(50);
  });

  it('allows a donor again exactly when the window ends', () => {
    expect(eligibility(new Date(now - 60 * DAY_MS), 60, now).eligible).toBe(true);
  });
});

describe('phone helpers', () => {
  it('normalises +62 and spacing to the local 08 form', () => {
    expect(normalizePhone('+62 812-3456-7890')).toBe('081234567890');
    expect(normalizePhone('0812 3456 7890')).toBe('081234567890');
  });

  it('masks the middle of a number for logs', () => {
    expect(maskPhone('081234567890')).toBe('0812****890');
  });
});

describe('distanceKm', () => {
  it('is zero for the same point and symmetric', () => {
    const monas = { lat: -6.1754, lng: 106.8272 };
    const tarakan = { lat: -6.1714, lng: 106.8118 };
    expect(distanceKm(monas, monas)).toBe(0);
    expect(distanceKm(monas, tarakan)).toBeCloseTo(distanceKm(tarakan, monas), 10);
  });

  it('matches a known distance (Monas to Bundaran HI, about 2 km)', () => {
    const d = distanceKm({ lat: -6.1754, lng: 106.8272 }, { lat: -6.1950, lng: 106.8230 });
    expect(d).toBeGreaterThan(1.9);
    expect(d).toBeLessThan(2.4);
  });
});
