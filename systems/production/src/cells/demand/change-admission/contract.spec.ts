import { proveOperation } from '@pressly/testkit/operation-proof';
import { changeAdmissionCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { changeAdmissionContract } from './contract.ts';

const input = {
  locationId: 'location-1',
  productionOrderId: '10000000-0000-4000-8000-000000000001',
  actorId: '10000000-0000-4000-8000-000000000002',
  target: 'released' as const,
  expectedVersion: 2,
  idempotencyKey: 'change-admission-command-1',
};

describe('change admission contract', () => {
  proveOperation({
    operationId: 'production.change-admission.v1',
    declaration: changeAdmissionCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips the deployed request and trusted actor',
        proves: ['contract'],
        run: () => {
          const serialized = changeAdmissionContract.input.encode(input);
          expect(changeAdmissionContract.input.decode(serialized)).toEqual({
            kind: 'valid',
            value: input,
          });
        },
      },
    ],
  });

  it('round-trips the serialized result', () => {
    const result = {
      locationId: input.locationId,
      orderId: input.productionOrderId,
      admissionOverride: 'released' as const,
      status: 'eligible' as const,
      version: 3,
      replayed: false,
    };
    expect(
      changeAdmissionContract.output.decode(
        changeAdmissionContract.output.encode(result),
      ),
    ).toEqual({ kind: 'valid', value: result });
  });
});
