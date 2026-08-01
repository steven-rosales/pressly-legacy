import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import type {
  ChangeProductionOrderResolution,
  ChangeProductionOrderResolutionRepository,
  ProductionOrderResolutionCandidate,
} from '../../src/change-production-order-resolution/change-production-order-resolution.port.ts';
import { productionError } from '../../src/failure-mapping/production.error.ts';
import { makeResolveSourceClosedFulfillment } from '../../src/change-production-order-resolution/resolve-source-closed-fulfillment.usecase.ts';

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
  const findOrderByFulfillment = vi.fn(async () => projection);
  const operations = {
    findWorkEvent: vi.fn(async () => null),
    findOrderByFulfillment,
    lockLocationScheduling: vi.fn(async () => undefined),
    lockOrder: vi.fn(async () => null),
    changeResolution: vi.fn(async () => null),
    appendWorkEvent: vi.fn(async () => undefined),
  };
  const repo: ChangeProductionOrderResolutionRepository = {
    transaction: async (work) => work(operations),
  };
  return { repo, findOrderByFulfillment };
};

const successfulChange = () =>
  vi.fn<ChangeProductionOrderResolution>(async (input) =>
    result.ok({
      locationId: input.locationId,
      orderId: input.orderId,
      action: 'resolve_without_production',
      resolutionState: 'resolved_without_production',
      transitionedAt: '2026-07-29T17:00:00.000Z',
      version: input.expectedVersion + 1,
      replayed: false,
    }),
  );

describe('resolve source-closed fulfillment', () => {
  it('delegates clean unreleased work to the authoritative resolution command', async () => {
    const repository = makeRepository(candidate());
    const changeResolution = successfulChange();
    const resolve = makeResolveSourceClosedFulfillment({
      repo: repository.repo,
      changeResolution,
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
    expect(repository.findOrderByFulfillment).toHaveBeenCalledWith(
      command.locationId,
      command.fulfillmentId,
    );
    expect(changeResolution).toHaveBeenCalledWith({
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
    const changeResolution = successfulChange();
    const missing = makeResolveSourceClosedFulfillment({
      repo: makeRepository(null).repo,
      changeResolution,
    });
    const historical = makeResolveSourceClosedFulfillment({
      repo: makeRepository(
        candidate({ resolutionState: 'resolved_without_production' }),
      ).repo,
      changeResolution,
    });
    const released = makeResolveSourceClosedFulfillment({
      repo: makeRepository(candidate({ sourceAdmissionState: 'released' }))
        .repo,
      changeResolution,
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
    expect(changeResolution).not.toHaveBeenCalled();
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
      const changeResolution = vi.fn<ChangeProductionOrderResolution>(
        async () => result.err(productionError(code, 'Not safe.', 409)),
      );
      const resolve = makeResolveSourceClosedFulfillment({
        repo: makeRepository(candidate()).repo,
        changeResolution,
      });

      await expect(resolve(command)).resolves.toMatchObject({
        tag: 'ok',
        value: { outcome: 'review_required', reason },
      });
    },
  );

  it('keeps unexpected persistence failures as errors', async () => {
    const failure = productionError(
      'PRODUCTION_ORDER_RESOLUTION_CHANGE_FAILED',
      'The order could not be changed.',
      500,
    );
    const resolve = makeResolveSourceClosedFulfillment({
      repo: makeRepository(candidate()).repo,
      changeResolution: vi.fn<ChangeProductionOrderResolution>(async () =>
        result.err(failure),
      ),
    });

    await expect(resolve(command)).resolves.toEqual({
      tag: 'err',
      error: failure,
    });
  });
});
