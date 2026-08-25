import { proveOperation } from '@pressly/testkit/operation-proof';
import { applyFulfillmentDemandCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import {
  applyFulfillmentDemandContract,
  applyFulfillmentDemandFailureContract,
} from './contract.ts';

const input = {
  fulfillmentId: '00000000-0000-4000-8000-000000000101',
  fulfillmentVersion: 2,
  projectionHash: 'a'.repeat(64),
  displayReference: 'ORDER-101',
  locationId: 'location-1',
  admissionState: 'unreleased' as const,
  commercialState: 'open' as const,
  dueAt: '2026-08-22T20:00:00.000Z',
  observedAt: '2026-08-22T15:00:00.000Z',
  estimatedWeightLbs: 24,
  estimatedWeightSource: 'external_estimate' as const,
  idempotencyKey: 'order-outbox:event-101',
};

describe('apply fulfillment demand contract', () => {
  proveOperation({
    operationId: 'production.apply-fulfillment-demand.v1',
    declaration: applyFulfillmentDemandCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips the exact mapped Production command and result',
        proves: ['contract'],
        run: () => {
          expect(applyFulfillmentDemandContract.input.version).toBe(2);
          expect(applyFulfillmentDemandContract.output.version).toBe(1);
          expect(applyFulfillmentDemandContract.failure.version).toBe(1);
          const decoded = applyFulfillmentDemandContract.input.decode(input);
          expect(decoded).toEqual({ kind: 'valid', value: input });
          if (decoded.kind === 'valid')
            expect(
              applyFulfillmentDemandContract.input.encode(decoded.value),
            ).toEqual(input);

          const output = {
            orderDemandId: '00000000-0000-4000-8000-000000000201',
            productionOrderId: null,
            outcome: 'applied' as const,
            replayed: false,
          };
          expect(applyFulfillmentDemandContract.output.decode(output)).toEqual({
            kind: 'valid',
            value: output,
          });
          expect(applyFulfillmentDemandContract.output.encode(output)).toEqual(
            output,
          );
        },
      },
    ],
  });

  it('keeps semantic validation in the executor so replay remains first', () => {
    expect(
      applyFulfillmentDemandContract.input.decode({
        ...input,
        fulfillmentVersion: 0,
        projectionHash: 'not-a-hash',
        dueAt: 'date-parser-decides',
      }),
    ).toMatchObject({ kind: 'valid' });
  });

  it('rejects structural drift, unknown fields, and enum drift', () => {
    const decoded = applyFulfillmentDemandContract.input.decode({
      ...input,
      fulfillmentVersion: '2',
      admissionState: 'source_pending',
      bagCount: 1,
      extra: true,
    });
    expect(decoded).toMatchObject({ kind: 'invalid' });
    if (decoded.kind === 'invalid')
      expect(decoded.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining([
          ['extra'],
          ['bagCount'],
          ['fulfillmentVersion'],
          ['admissionState'],
        ]),
      );
  });

  it('round-trips semantic validation and conflict failures strictly', () => {
    const validation = {
      kind: 'validation' as const,
      classification: 'semantic' as const,
      code: 'fulfillment_demand_invalid',
      message: 'invalid',
      safeMessage: 'invalid',
    };
    const conflict = {
      kind: 'conflict' as const,
      code: 'fulfillment_demand_diverged',
      message: 'diverged',
      safeMessage: 'diverged',
    };
    expect(applyFulfillmentDemandFailureContract.decode(validation)).toEqual({
      kind: 'valid',
      value: validation,
    });
    expect(applyFulfillmentDemandFailureContract.decode(conflict)).toEqual({
      kind: 'valid',
      value: conflict,
    });
    expect(
      applyFulfillmentDemandFailureContract.decode({
        ...conflict,
        classification: 'semantic',
      }),
    ).toMatchObject({ kind: 'invalid' });
  });
});
