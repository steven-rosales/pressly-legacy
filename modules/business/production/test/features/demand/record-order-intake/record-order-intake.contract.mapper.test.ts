import { describe, expect, it } from 'vitest';
import { toRecordOrderIntakeResult } from '../../../../src/features/demand/record-order-intake/record-order-intake.contract.mapper.ts';

describe('record Order intake mapper', () => {
  it('maps the application result to the serialized response', () => {
    expect(
      toRecordOrderIntakeResult({
        locationId: 'location-1',
        orderId: 'order-1',
        bagCount: 2,
        bagCountProvenance: 'operator_intake',
        intakeVersion: 3,
        version: 4,
        replayed: false,
      }),
    ).toEqual({
      locationId: 'location-1',
      orderId: 'order-1',
      bagCount: 2,
      bagCountProvenance: 'operator_intake',
      intakeVersion: 3,
      version: 4,
      replayed: false,
    });
  });
});
