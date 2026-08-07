import { describe, expect, it } from 'vitest';
import { toProductionOrderPriorityResult } from '../../../../src/features/demand/set-order-priority/set-production-order-priority.contract.mapper.ts';

describe('set production order priority mapper', () => {
  it('maps the module-owned mutation result to the wire result', () => {
    expect(
      toProductionOrderPriorityResult({
        entityId: '00000000-0000-4000-8000-000000000001',
        version: 2,
        replayed: false,
      }),
    ).toEqual({
      entityId: '00000000-0000-4000-8000-000000000001',
      version: 2,
      replayed: false,
    });
  });
});
