import { describe, expect, it } from 'vitest';
import { mapCentsDemandPhase } from '../../../src/vendors/cents/cents-demand-phase.ts';

describe('Cents demand phase mapping', () => {
  it.each([
    ['SUBMITTED', 'expected'],
    ['READY_FOR_PICKUP', 'expected'],
    ['PICKED_UP', 'inbound'],
    ['IN_PROGRESS', 'production_released'],
    ['READY_FOR_RETURN', 'post_production'],
    ['OUT_FOR_DELIVERY', 'post_production'],
    ['COMPLETED', 'post_production'],
    ['CANCELED', 'withdrawn'],
  ] as const)('maps %s to %s', (status, phase) => {
    expect(mapCentsDemandPhase(status)).toBe(phase);
  });
});
