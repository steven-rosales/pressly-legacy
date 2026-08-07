import { describe, expect, it } from 'vitest';
import { toChangeProductionAdmissionResult } from '../../../../src/features/demand/change-admission/change-production-admission.contract.mapper.ts';

describe('change Production admission mapper', () => {
  it('maps the application result to the serialized response', () => {
    const result = {
      locationId: 'location-1',
      orderId: '11111111-1111-4111-8111-111111111111',
      admissionOverride: 'released' as const,
      status: 'eligible' as const,
      version: 3,
      replayed: false,
    };

    expect(toChangeProductionAdmissionResult(result)).toEqual(result);
  });
});
