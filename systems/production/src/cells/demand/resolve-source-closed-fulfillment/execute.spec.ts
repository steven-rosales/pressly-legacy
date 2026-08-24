import { proveOperation } from '@pressly/testkit/operation-proof';
import { resolveSourceClosedFulfillmentCellDeclaration } from './cell.ts';
import { databaseError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteResolveSourceClosedFulfillment } from './execute.ts';
import type {
  ProductionOrderResolutionCandidate,
  ResolveProductionOrderWithoutProduction,
  ResolveSourceClosedFulfillmentCommand,
  ResolveSourceClosedFulfillmentRepository,
} from './types.ts';

const command: ResolveSourceClosedFulfillmentCommand = {
  locationId: 'location-1',
  fulfillmentId: '20000000-0000-4000-8000-000000000001',
  actorId: '30000000-0000-4000-8000-000000000001',
  idempotencyKey: 'source-close-resolution-1',
};

const candidate = (
  overrides: Partial<ProductionOrderResolutionCandidate> = {},
): ProductionOrderResolutionCandidate => ({
  productionOrderId: '10000000-0000-4000-8000-000000000001',
  locationId: command.locationId,
  productionVersion: 3,
  resolutionState: 'open',
  sourceAdmissionState: 'unreleased',
  sourceCommercialState: 'open',
  ...overrides,
});

const repository = (
  value: ProductionOrderResolutionCandidate | null,
): ResolveSourceClosedFulfillmentRepository => ({
  findCandidate: vi.fn(async () => value),
});

const successfulResolution = (
  replayed = false,
): ResolveProductionOrderWithoutProduction =>
  vi.fn<ResolveProductionOrderWithoutProduction>(async (input) => ({
    kind: 'success',
    value: {
      orderId: input.productionOrderId,
      version: input.expectedVersion + 1,
      replayed,
    },
  }));

describe('execute resolve source-closed fulfillment', () => {
  proveOperation({
    operationId: 'production.resolve-source-closed-fulfillment.v1',
    declaration: resolveSourceClosedFulfillmentCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'delegates the exact authoritative resolution command and maps success',
        proves: ['executor-success'],
        run: async () => {
          const resolveProductionOrder = successfulResolution();
          const repo = repository(candidate());
          const execute = makeExecuteResolveSourceClosedFulfillment({
            repo,
            resolveProductionOrder,
          });

          await expect(execute(command)).resolves.toEqual({
            kind: 'success',
            value: {
              outcome: 'resolved',
              locationId: command.locationId,
              fulfillmentId: command.fulfillmentId,
              productionOrderId: candidate().productionOrderId,
              version: 4,
              replayed: false,
            },
          });
          expect(repo.findCandidate).toHaveBeenCalledWith(
            command.locationId,
            command.fulfillmentId,
          );
          expect(resolveProductionOrder).toHaveBeenCalledWith({
            locationId: command.locationId,
            productionOrderId: candidate().productionOrderId,
            action: 'resolve_without_production',
            reason: 'order_will_not_be_produced',
            note: null,
            confirmReviewedFacts: false,
            sourceStatePrecondition: {
              commercialState: 'open',
              admissionState: 'unreleased',
            },
            expectedVersion: 3,
            idempotencyKey: command.idempotencyKey,
            actorId: command.actorId,
          });
        },
      },
    ],
  });

  it('delegates repeated idempotency unchanged and reports inner replay', async () => {
    let calls = 0;
    const resolveProductionOrder =
      vi.fn<ResolveProductionOrderWithoutProduction>(async (input) => ({
        kind: 'success',
        value: {
          orderId: input.productionOrderId,
          version: 4,
          replayed: calls++ > 0,
        },
      }));
    const execute = makeExecuteResolveSourceClosedFulfillment({
      repo: repository(candidate()),
      resolveProductionOrder,
    });

    await expect(execute(command)).resolves.toMatchObject({
      value: { outcome: 'resolved', replayed: false },
    });
    await expect(execute(command)).resolves.toMatchObject({
      value: { outcome: 'resolved', replayed: true },
    });
    expect(resolveProductionOrder).toHaveBeenCalledTimes(2);
    expect(resolveProductionOrder.mock.calls[0]?.[0].idempotencyKey).toBe(
      command.idempotencyKey,
    );
    expect(resolveProductionOrder.mock.calls[1]?.[0].idempotencyKey).toBe(
      command.idempotencyKey,
    );
  });

  it.each([
    {
      name: 'missing projection',
      value: null,
      result: {
        outcome: 'not_found',
        locationId: command.locationId,
        fulfillmentId: command.fulfillmentId,
      },
    },
    {
      name: 'closed canonical order',
      value: candidate({ sourceCommercialState: 'completed' }),
      result: {
        outcome: 'review_required',
        locationId: command.locationId,
        fulfillmentId: command.fulfillmentId,
        productionOrderId: candidate().productionOrderId,
        version: 3,
        reason: 'canonical_order_not_open',
      },
    },
    {
      name: 'released fulfillment',
      value: candidate({ sourceAdmissionState: 'released' }),
      result: {
        outcome: 'review_required',
        locationId: command.locationId,
        fulfillmentId: command.fulfillmentId,
        productionOrderId: candidate().productionOrderId,
        version: 3,
        reason: 'fulfillment_not_unreleased',
      },
    },
  ])(
    'returns exact $name no-op without delegation',
    async ({ value, result }) => {
      const resolveProductionOrder = successfulResolution();
      const execute = makeExecuteResolveSourceClosedFulfillment({
        repo: repository(value),
        resolveProductionOrder,
      });
      await expect(execute(command)).resolves.toEqual({
        kind: 'success',
        value: result,
      });
      expect(resolveProductionOrder).not.toHaveBeenCalled();
    },
  );

  it('consults the authoritative receipt for an already resolved projection', async () => {
    const resolveProductionOrder = successfulResolution(true);
    const execute = makeExecuteResolveSourceClosedFulfillment({
      repo: repository(
        candidate({ resolutionState: 'resolved_without_production' }),
      ),
      resolveProductionOrder,
    });

    await expect(execute(command)).resolves.toEqual({
      kind: 'success',
      value: {
        outcome: 'resolved',
        locationId: command.locationId,
        fulfillmentId: command.fulfillmentId,
        productionOrderId: candidate().productionOrderId,
        version: 3,
        replayed: true,
      },
    });
    expect(resolveProductionOrder).toHaveBeenCalledWith({
      locationId: command.locationId,
      productionOrderId: candidate().productionOrderId,
      action: 'resolve_without_production',
      reason: 'order_will_not_be_produced',
      note: null,
      confirmReviewedFacts: false,
      sourceStatePrecondition: {
        commercialState: 'open',
        admissionState: 'unreleased',
      },
      expectedVersion: 2,
      idempotencyKey: command.idempotencyKey,
      actorId: command.actorId,
    });
  });

  it('preserves the historical no-receipt fallback only while the same version remains resolved', async () => {
    const resolved = candidate({
      productionVersion: 4,
      resolutionState: 'resolved_without_production',
    });
    const repo = repository(resolved);
    const execute = makeExecuteResolveSourceClosedFulfillment({
      repo,
      resolveProductionOrder: vi.fn(async () => ({
        kind: 'failure' as const,
        failure: { code: 'production_order_version_conflict' },
      })),
    });

    await expect(execute(command)).resolves.toEqual({
      kind: 'success',
      value: {
        outcome: 'already_resolved',
        locationId: command.locationId,
        fulfillmentId: command.fulfillmentId,
        productionOrderId: resolved.productionOrderId,
        version: 4,
      },
    });
    expect(repo.findCandidate).toHaveBeenCalledTimes(2);
  });

  it('returns concurrent review when resolved work changes before delegated receipt lookup', async () => {
    const resolved = candidate({
      productionVersion: 4,
      resolutionState: 'resolved_without_production',
    });
    const restored = candidate({
      productionVersion: 5,
      resolutionState: 'open',
    });
    const findCandidate = vi
      .fn<ResolveSourceClosedFulfillmentRepository['findCandidate']>()
      .mockResolvedValueOnce(resolved)
      .mockResolvedValueOnce(restored);
    const execute = makeExecuteResolveSourceClosedFulfillment({
      repo: { findCandidate },
      resolveProductionOrder: vi.fn(async () => ({
        kind: 'failure' as const,
        failure: { code: 'production_order_version_conflict' },
      })),
    });

    await expect(execute(command)).resolves.toEqual({
      kind: 'success',
      value: {
        outcome: 'review_required',
        locationId: command.locationId,
        fulfillmentId: command.fulfillmentId,
        productionOrderId: restored.productionOrderId,
        version: 5,
        reason: 'concurrent_change',
      },
    });
    expect(findCandidate).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      code: 'production_order_resolution_review_required',
      reason: 'operational_review_required',
    },
    {
      code: 'production_order_resolution_blocked',
      reason: 'operational_participation',
    },
    {
      code: 'production_order_source_state_conflict',
      reason: 'concurrent_change',
    },
  ])(
    'preserves work as $reason for delegated $code',
    async ({ code, reason }) => {
      const execute = makeExecuteResolveSourceClosedFulfillment({
        repo: repository(candidate()),
        resolveProductionOrder: vi.fn(async () => ({
          kind: 'failure' as const,
          failure: { code },
        })),
      });
      await expect(execute(command)).resolves.toEqual({
        kind: 'success',
        value: {
          outcome: 'review_required',
          locationId: command.locationId,
          fulfillmentId: command.fulfillmentId,
          productionOrderId: candidate().productionOrderId,
          version: 3,
          reason,
        },
      });
    },
  );

  it('preserves owned AppErrors and maps unknown faults exactly', async () => {
    const owned = databaseError({
      code: 'production_order_resolution_change_failed',
      message: 'The order could not be changed.',
      safeMessage: 'The order could not be changed.',
      status: 503,
    });
    const delegatedFailure = makeExecuteResolveSourceClosedFulfillment({
      repo: repository(candidate()),
      resolveProductionOrder: vi.fn(() => Promise.reject(owned)),
    });
    await expect(delegatedFailure(command)).rejects.toBe(owned);

    const unknownFailure = makeExecuteResolveSourceClosedFulfillment({
      repo: {
        findCandidate: vi.fn(() => Promise.reject('database offline')),
      },
      resolveProductionOrder: successfulResolution(),
    });
    await expect(unknownFailure(command)).rejects.toMatchObject({
      code: 'production_source_closed_resolution_failed',
      message: 'The source-closed fulfillment could not be evaluated.',
      safeMessage: 'The source-closed fulfillment could not be evaluated.',
      status: 503,
    });
  });
});
