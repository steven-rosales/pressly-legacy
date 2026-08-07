import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import type { ProductionOrderResolutionCandidate } from '../../../../src/features/demand/resolve-source-closed-fulfillment/resolve-source-closed-fulfillment.model.ts';
import type {
  ResolveProductionOrderWithoutProduction,
  ResolveSourceClosedFulfillmentRepository,
} from '../../../../src/features/demand/resolve-source-closed-fulfillment/resolve-source-closed-fulfillment.port.ts';
import { makeResolveSourceClosedFulfillment } from '../../../../src/features/demand/resolve-source-closed-fulfillment/resolve-source-closed-fulfillment.usecase.ts';
import { conflictFailure } from '../../../../src/foundations/language/failures/production-failure.factory.ts';

const candidate = (
  overrides: Partial<ProductionOrderResolutionCandidate> = {},
): ProductionOrderResolutionCandidate => ({
  orderId: '11111111-1111-4111-8111-111111111111',
  locationId: 'location-1',
  productionVersion: 3,
  resolutionState: 'open',
  sourceAdmissionState: 'unreleased',
  sourceCommercialState: 'open',
  ...overrides,
});

const command = {
  locationId: 'location-1',
  fulfillmentId: '22222222-2222-4222-8222-222222222222',
  actorId: '33333333-3333-4333-8333-333333333333',
  idempotencyKey: 'source-close-resolution-1',
} as const;

const makeRepository = (
  projection: ProductionOrderResolutionCandidate | null,
) => {
  const findCandidate = vi.fn(async () => projection);
  const repo: ResolveSourceClosedFulfillmentRepository = { findCandidate };
  return { repo, findCandidate };
};

const successfulChange = () =>
  vi.fn<ResolveProductionOrderWithoutProduction>(async (input) =>
    result.ok({
      orderId: input.orderId,
      version: input.expectedVersion + 1,
      replayed: false,
    }),
  );

describe('resolve source-closed fulfillment', () => {
  it('delegates clean unreleased work to the authoritative resolution command', async () => {
    const repository = makeRepository(candidate());
    const resolveProductionOrder = successfulChange();
    const resolve = makeResolveSourceClosedFulfillment({
      repo: repository.repo,
      resolveProductionOrder,
    });

    await expect(resolve(command)).resolves.toEqual({
      tag: 'ok',
      value: {
        outcome: 'resolved',
        locationId: command.locationId,
        fulfillmentId: command.fulfillmentId,
        productionOrderId: candidate().orderId,
        version: 4,
        replayed: false,
      },
    });
    expect(repository.findCandidate).toHaveBeenCalledWith(
      command.locationId,
      command.fulfillmentId,
    );
    expect(resolveProductionOrder).toHaveBeenCalledWith({
      locationId: command.locationId,
      orderId: candidate().orderId,
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
  });

  it('returns explicit no-op outcomes before requesting a mutation', async () => {
    const resolveProductionOrder = successfulChange();
    const missing = makeResolveSourceClosedFulfillment({
      repo: makeRepository(null).repo,
      resolveProductionOrder,
    });
    const historical = makeResolveSourceClosedFulfillment({
      repo: makeRepository(
        candidate({ resolutionState: 'resolved_without_production' }),
      ).repo,
      resolveProductionOrder,
    });
    const released = makeResolveSourceClosedFulfillment({
      repo: makeRepository(candidate({ sourceAdmissionState: 'released' }))
        .repo,
      resolveProductionOrder,
    });

    await expect(missing(command)).resolves.toMatchObject({
      tag: 'ok',
      value: { outcome: 'not_found' },
    });
    await expect(historical(command)).resolves.toMatchObject({
      tag: 'ok',
      value: { outcome: 'already_resolved' },
    });
    await expect(released(command)).resolves.toMatchObject({
      tag: 'ok',
      value: {
        outcome: 'review_required',
        reason: 'fulfillment_not_unreleased',
      },
    });
    expect(resolveProductionOrder).not.toHaveBeenCalled();
  });

  it.each([
    {
      code: 'PRODUCTION_ORDER_RESOLUTION_REVIEW_REQUIRED',
      reason: 'operational_review_required',
    },
    {
      code: 'PRODUCTION_ORDER_RESOLUTION_BLOCKED',
      reason: 'operational_participation',
    },
    {
      code: 'PRODUCTION_ORDER_VERSION_CONFLICT',
      reason: 'concurrent_change',
    },
  ])(
    'conservatively preserves work when the resolution command returns $code',
    async ({ code, reason }) => {
      const resolveProductionOrder =
        vi.fn<ResolveProductionOrderWithoutProduction>(async () =>
          result.err(
            conflictFailure({
              code: code.toLowerCase(),
              message: 'Not safe.',
              safeMessage: 'Not safe.',
            }),
          ),
        );
      const resolve = makeResolveSourceClosedFulfillment({
        repo: makeRepository(candidate()).repo,
        resolveProductionOrder,
      });

      await expect(resolve(command)).resolves.toMatchObject({
        tag: 'ok',
        value: { outcome: 'review_required', reason },
      });
    },
  );

  it('keeps unexpected persistence failures as errors', async () => {
    const failure = databaseError({
      code: 'production_order_resolution_change_failed',
      message: 'The order could not be changed.',
      safeMessage: 'The order could not be changed.',
      status: 503,
    });
    const resolve = makeResolveSourceClosedFulfillment({
      repo: makeRepository(candidate()).repo,
      resolveProductionOrder: vi
        .fn<ResolveProductionOrderWithoutProduction>()
        .mockRejectedValue(failure),
    });

    await expect(resolve(command)).rejects.toBe(failure);
  });
});
