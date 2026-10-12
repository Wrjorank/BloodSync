import { describe, expect, it } from 'vitest';
import type { BloodRequest } from '@prisma/client';
import { computeProgress } from '../../src/services/dispatch.service';

const request = (over: Partial<BloodRequest> = {}) => ({ bagsNeeded: 4, allocatedFromStock: 0, bagsCollected: 0, ...over }) as BloodRequest;

describe('computeProgress', () => {
  it('starts with everything uncovered', () => {
    expect(computeProgress(request(), {})).toMatchObject({ needed: 4, fulfilled: 0, remaining: 4, uncovered: 4 });
  });

  it('counts stock and collected bags as fulfilled', () => {
    const p = computeProgress(request({ allocatedFromStock: 1, bagsCollected: 1 }), {});
    expect(p).toMatchObject({ fulfilled: 2, fromStock: 1, collected: 1, remaining: 2 });
  });

  it('treats donors holding a slot as covering the need, but not as fulfilled', () => {
    const p = computeProgress(request(), { RESERVED: 1, ARRIVED: 1, SCREENED: 1, INVITED: 5 });
    expect(p).toMatchObject({ reserved: 3, invited: 5, fulfilled: 0, remaining: 4, uncovered: 1 });
  });

  it('never goes negative when more units arrive than needed', () => {
    const p = computeProgress(request({ allocatedFromStock: 3, bagsCollected: 3 }), { RESERVED: 2 });
    expect(p.remaining).toBe(0);
    expect(p.uncovered).toBe(0);
  });
});
