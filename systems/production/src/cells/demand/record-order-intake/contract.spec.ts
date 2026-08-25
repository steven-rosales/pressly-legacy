import { proveOperation } from '@pressly/testkit/operation-proof';
import { recordOrderIntakeCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { recordOrderIntakeContract } from './contract.ts';

const input = {
  locationId: 'location-1',
  productionOrderId: '10000000-0000-4000-8000-000000000001',
  actorId: '10000000-0000-4000-8000-000000000002',
  bagCount: 3,
  expectedVersion: 2,
  idempotencyKey: 'record-intake-command-1',
};

describe('record order intake contract', () => {
  proveOperation({
    operationId: 'production.record-order-intake.v1',
    declaration: recordOrderIntakeCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips the exact deployed request and trusted actor',
        proves: ['contract'],
        run: () => {
          expect(
            recordOrderIntakeContract.input.decode(
              recordOrderIntakeContract.input.encode(input),
            ),
          ).toEqual({ kind: 'valid', value: input });
        },
      },
    ],
  });

  it('round-trips the exact serialized result', () => {
    const output = {
      locationId: input.locationId,
      orderId: input.productionOrderId,
      bagCount: 3,
      bagCountProvenance: 'operator_intake' as const,
      intakeVersion: 2,
      version: 3,
      replayed: false,
    };
    expect(
      recordOrderIntakeContract.output.decode(
        recordOrderIntakeContract.output.encode(output),
      ),
    ).toEqual({ kind: 'valid', value: output });
  });

  it('rejects malformed input and invalid success output', () => {
    expect(
      recordOrderIntakeContract.input.decode({
        body: { bagCount: -1 },
        params: {},
        actorId: '',
      }),
    ).toMatchObject({ kind: 'invalid' });
    expect(() =>
      recordOrderIntakeContract.output.encode({
        locationId: input.locationId,
        orderId: input.productionOrderId,
        bagCount: -1,
        bagCountProvenance: 'operator_intake',
        intakeVersion: 2,
        version: 3,
        replayed: false,
      }),
    ).toThrow(
      expect.objectContaining({ code: 'invalid_api_success_response' }),
    );
  });
});
