import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { fulfillmentDemandChangedV2MessageContract } from '@pressly/orders-system/contracts/fulfillment-demand-changed-v2';
import {
  applyFulfillmentDemandCellDeclaration,
  makeApplyFulfillmentDemandCell,
} from './cell.ts';
import { applyFulfillmentDemandJobSurface } from './job.ts';
import type { ApplyFulfillmentDemandCommand } from './types.ts';

const input: ApplyFulfillmentDemandCommand = {
  fulfillmentId: 'fulfillment-1',
  fulfillmentVersion: 1,
  projectionHash: 'a'.repeat(64),
  displayReference: null,
  locationId: 'location-1',
  admissionState: 'unreleased',
  commercialState: 'open',
  dueAt: '2026-08-22T20:00:00.000Z',
  observedAt: '2026-08-22T15:00:00.000Z',
  estimatedWeightLbs: null,
  estimatedWeightSource: null,
  idempotencyKey: 'order-outbox:event-1',
};

describe('production.apply-fulfillment-demand.v1 declaration', () => {
  proveOperation({
    operationId: 'production.apply-fulfillment-demand.v1',
    declaration: applyFulfillmentDemandCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'is a selected message reaction over the exact external Orders event identity',
        proves: ['protocol', 'message-compatibility'],
        run: () => {
          expect(applyFulfillmentDemandCellDeclaration).toMatchObject({
            id: 'production.apply-fulfillment-demand.v1',
            kind: 'reaction',
            authentication: 'none',
            authorization: null,
            consistency: {
              transaction: 'required',
              concurrency: 'partitioned',
            },
            idempotency: { required: true },
            consumes: [
              {
                id: 'fulfillment_demand_changed.v2',
                type: 'fulfillment_demand_changed',
                version: 2,
                scope: 'external',
              },
            ],
            emits: [],
            retry: {
              maxAttempts: 8,
              strategy: 'bounded-exponential-jitter',
              deadLetter: 'retain',
            },
            observability: { operation: 'production.apply_fulfillment_demand' },
          });
          expect(fulfillmentDemandChangedV2MessageContract).toBe(
            applyFulfillmentDemandCellDeclaration.consumes[0],
          );
          expect(applyFulfillmentDemandCellDeclaration.surfaces).toHaveLength(
            1,
          );
          expect(applyFulfillmentDemandJobSurface).toMatchObject({
            kind: 'job',
            trigger: 'message',
            queue: 'order_outbox',
          });
          expect(
            applyFulfillmentDemandJobSurface.toSerializedInput(input),
          ).toBe(input);
          expect(
            applyFulfillmentDemandJobSurface.presentFailure({
              kind: 'conflict',
              code: 'production_version_conflict',
              message: 'Private diagnostic message.',
              safeMessage: 'Production state changed. Try again.',
            }),
          ).toEqual({
            code: 'production_version_conflict',
            message: 'Production state changed. Try again.',
            retryable: false,
            category: 'conflict',
            status: 409,
          });
          expect(
            applyFulfillmentDemandCellDeclaration.consistency.concurrencyKey?.(
              input,
            ),
          ).toBe(input.locationId);
          expect(
            applyFulfillmentDemandCellDeclaration.consistency.expectedVersion?.(
              input,
            ),
          ).toBe(`${input.fulfillmentVersion}:${input.projectionHash}`);
          expect(
            applyFulfillmentDemandCellDeclaration.idempotency.key?.(input),
          ).toBe(input.idempotencyKey);
        },
      },
    ],
  });

  it('keeps durable claiming, raw validation, filtering, mapping, and retry effects outside the cell', async () => {
    const transaction = vi.fn(async (work) =>
      work({
        findWorkEvent: async () => null,
        locationIsActive: async () => false,
        lockLocationScheduling: async () => undefined,
        lockFulfillment: async () => undefined,
        loadDemand: async () => null,
        applyDemand: async () => ({ kind: 'version_conflict' as const }),
        appendWorkEvent: async () => undefined,
      }),
    );
    const cell = makeApplyFulfillmentDemandCell({
      repo: { transaction },
      idempotency: { resolveReplay: () => ({ kind: 'miss' }) },
      policy: {
        evaluateDemandLifecycle: vi.fn(),
        initialProductionOrderExecutionState: 'unassigned',
        resolveProductionOrderExecutionState: vi.fn(),
        deriveProductionOrderOperationalStatus: vi.fn(),
      },
      clock: { now: vi.fn() },
      ids: { next: vi.fn() },
    });
    await expect(cell.execute(input)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_location_unavailable' },
    });
    expect(transaction).toHaveBeenCalledOnce();
  });
});
