import { describe, expect, it } from 'vitest';
import { compatibleDonorTypes } from '../../src/constants/blood';

describe('compatibleDonorTypes', () => {
  it('only calls the identical type unless cross-type is allowed', () => {
    expect(compatibleDonorTypes('A+', 'PRC', false)).toEqual(['A+']);
  });

  it('lists the identical type first, then every compatible red cell donor', () => {
    const types = compatibleDonorTypes('A+', 'PRC', true);
    expect(types[0]).toBe('A+');
    expect(new Set(types)).toEqual(new Set(['A+', 'A-', 'O+', 'O-']));
  });

  it('gives O- recipients O- only, and AB+ recipients every type', () => {
    expect(compatibleDonorTypes('O-', 'PRC', true)).toEqual(['O-']);
    expect(compatibleDonorTypes('AB+', 'PRC', true)).toHaveLength(8);
  });

  it('never mixes ABO for platelets or whole blood, even when allowed', () => {
    expect(compatibleDonorTypes('A+', 'TC', true)).toEqual(['A+']);
    expect(compatibleDonorTypes('B-', 'WB', true)).toEqual(['B-']);
  });

  it('never offers a donor type the recipient cannot receive', () => {
    expect(compatibleDonorTypes('O+', 'PRC', true)).not.toContain('A+');
    expect(compatibleDonorTypes('B-', 'PRC', true)).not.toContain('B+');
  });
});
