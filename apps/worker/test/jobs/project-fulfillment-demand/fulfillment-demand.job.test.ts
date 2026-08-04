import { makeAppError } from '@pressly/errors/app-error';
import { nullLogger } from '@pressly/logging';
import {
  nullCounterSink,
  nullErrorReporter,
  type ErrorReporter,
} from '@pressly/observability';
import type { OrdersApplication, OrderOutboxEvent } from '@pressly/orders';
import {
  productionFailureToAppError,
  type ProductionApplication,
  type ProductionFeatureFailure,
} from '@pressly/production';
import { describe, expect, it, vi } from 'vitest';
import { makeFulfillmentDemandProjectionJob } from '../../../src/jobs/project-fulfillment-demand/fulfillment-demand.job.ts';

type DemandOutboxEvent = Extract<
  OrderOutboxEvent,
  { kind: 'fulfillment_demand_changed' }
>;

const productionConflict = (input: {
  code: string;
  message: string;
  safeMessage: string;
}): ProductionFeatureFailure => ({
  tag: 'ProductionFailure',
  kind: 'conflict',
  ...input,
});

const event = (
  overrides: Partial<DemandOutboxEvent> = {},
): DemandOutboxEvent => ({
  id: '00000000-0000-4000-8000-000000000001',
  orderId: '00000000-0000-4000-8000-000000000002',
  fulfillmentId: '00000000-0000-4000-8000-000000000003',
  kind: 'fulfillment_demand_changed',
  eventType: 'fulfillment_demand_changed',
  aggregateVersion: 2,
  attempts: 1,
  leaseOwner: 'worker-1',
  leaseExpiresAt: new Date('2026-07-21T14:01:00.000Z'),
  payload: {
    schemaVersion: 1,
    eventType: 'fulfillment_demand_changed',
    fulfillmentId: '00000000-0000-4000-8000-000000000003',
    displayNumber: 'P-1042',
    locationId: 'location-1',
    typeCode: 'wash_fold',
    admissionState: 'released',
    commercialState: 'completed',
    dueAt: new Date('2026-07-22T20:00:00.000Z'),
    estimatedWeightLbs: 42,
    estimatedWeightSource: 'source_estimate',
    bagCount: 2,
    version: 2,
    observedAt: new Date('2026-07-21T14:00:00.000Z'),
  },
  ...overrides,
});

const setup = (input: {
  claimed?: readonly OrderOutboxEvent[];
  project?: ProductionApplication['applyFulfillmentDemand'];
  complete?: OrdersApplication['completeOutbox'];
  errors?: ErrorReporter;
}) => {
  const claimOutbox = vi.fn(async () => ({
    tag: 'ok' as const,
    value: input.claimed ?? [event()],
  }));
  const completeOutbox = vi.fn(
    input.complete ??
      (async () => ({
        completed: true,
      })),
  );
  const retryOutbox = vi.fn(async () => ({
    retried: true,
  }));
  const deadLetterOutbox = vi.fn(async () => ({
    tag: 'ok' as const,
    value: { deadLettered: true },
  }));
  const applyFulfillmentDemand = vi.fn(
    input.project ??
      (async () => ({
        tag: 'ok' as const,
        value: {
          orderDemandId: '00000000-0000-4000-8000-000000000004',
          productionOrderId: '00000000-0000-4000-8000-000000000005',
          outcome: 'applied' as const,
          replayed: false,
        },
      })),
  );
  const processor = makeFulfillmentDemandProjectionJob({
    orders: {
      claimOutbox,
      completeOutbox,
      retryOutbox,
      deadLetterOutbox,
    },
    production: { applyFulfillmentDemand },
    clock: { now: () => new Date('2026-07-21T14:00:00.000Z') },
    random: () => 0.5,
    logger: nullLogger,
    counters: nullCounterSink,
    errors: input.errors ?? nullErrorReporter,
    config: {
      workerId: 'worker-1',
      leaseMs: 30_000,
      batchSize: 20,
      maxAttempts: 8,
      retryBaseMs: 1_000,
      retryMaxMs: 300_000,
    },
  });
  return {
    processor,
    claimOutbox,
    completeOutbox,
    retryOutbox,
    deadLetterOutbox,
    applyFulfillmentDemand,
  };
};

describe('order outbox projector', () => {
  it('projects source-neutral wash-and-fold demand and acknowledges it', async () => {
    const harness = setup({});
    await expect(harness.processor.runOnce()).resolves.toBe(1);

    expect(harness.applyFulfillmentDemand).toHaveBeenCalledWith(
      expect.objectContaining({
        fulfillmentId: event().fulfillmentId,
        fulfillmentVersion: 2,
        displayReference: 'P-1042',
        admissionState: 'released',
        commercialState: 'completed',
        dueAt: '2026-07-22T20:00:00.000Z',
        observedAt: '2026-07-21T14:00:00.000Z',
        estimatedWeightSource: 'external_estimate',
        idempotencyKey: `order-outbox:${event().id}`,
        projectionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(harness.completeOutbox).toHaveBeenCalledWith({
      eventId: event().id,
      workerId: 'worker-1',
    });
  });

  it('replays the same Production command after the completion crash window', async () => {
    const completionFailure = makeAppError({
      kind: 'DatabaseError',
      code: 'completion_unavailable',
      message: 'failed',
      safeMessage: 'failed',
      status: 503,
    });
    const complete = vi
      .fn<OrdersApplication['completeOutbox']>()
      .mockRejectedValueOnce(completionFailure)
      .mockResolvedValueOnce({ completed: true });
    const harness = setup({ complete });

    await expect(harness.processor.runOnce()).rejects.toMatchObject({
      code: 'completion_unavailable',
    });
    await expect(harness.processor.runOnce()).resolves.toBe(1);

    expect(harness.applyFulfillmentDemand).toHaveBeenCalledTimes(2);
    expect(harness.applyFulfillmentDemand.mock.calls[0]?.[0]).toEqual(
      harness.applyFulfillmentDemand.mock.calls[1]?.[0],
    );
    expect(harness.completeOutbox).toHaveBeenCalledTimes(2);
  });

  it('acknowledges fulfillment types that Production does not execute', async () => {
    const other = event({
      payload: { ...event().payload, typeCode: 'dry_cleaning' },
    });
    const harness = setup({ claimed: [other] });

    await expect(harness.processor.runOnce()).resolves.toBe(1);
    expect(harness.applyFulfillmentDemand).not.toHaveBeenCalled();
    expect(harness.completeOutbox).toHaveBeenCalledOnce();
  });

  it('returns a thrown Production fault to the durable retry queue', async () => {
    const projectionFailure = makeAppError({
      kind: 'DatabaseError',
      code: 'production_unavailable',
      message: 'failed',
      safeMessage: 'Production is temporarily unavailable.',
      status: 503,
    });
    const harness = setup({
      project: async () => {
        throw projectionFailure;
      },
    });

    await expect(harness.processor.runOnce()).resolves.toBe(1);
    expect(harness.completeOutbox).not.toHaveBeenCalled();
    expect(harness.retryOutbox).toHaveBeenCalledWith({
      eventId: event().id,
      workerId: 'worker-1',
      availableAt: new Date('2026-07-21T14:00:01.000Z'),
      errorCode: 'production_unavailable',
      errorMessage: 'Production is temporarily unavailable.',
    });
  });

  it('isolates a thrown projection failure and continues the claimed batch', async () => {
    const first = event({ id: 'first' });
    const second = event({ id: 'second' });
    const apply = vi
      .fn<ProductionApplication['applyFulfillmentDemand']>()
      .mockRejectedValueOnce(new Error('projection crashed'))
      .mockResolvedValueOnce({
        tag: 'ok',
        value: {
          orderDemandId: '00000000-0000-4000-8000-000000000004',
          productionOrderId: '00000000-0000-4000-8000-000000000005',
          outcome: 'applied',
          replayed: false,
        },
      });
    const harness = setup({ claimed: [first, second], project: apply });

    await expect(harness.processor.runOnce()).resolves.toBe(2);

    expect(harness.retryOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'first',
        errorCode: 'unexpected_error',
      }),
    );
    expect(harness.deadLetterOutbox).not.toHaveBeenCalled();
    expect(harness.completeOutbox).toHaveBeenCalledWith({
      eventId: 'second',
      workerId: 'worker-1',
    });
  });

  it('dead-letters invalid durable events without retrying them', async () => {
    const invalid: OrderOutboxEvent = {
      ...event(),
      kind: 'invalid',
      eventType: 'unknown_event',
      payload: {},
      validationError: 'unsupported_event_type',
    };
    const harness = setup({ claimed: [invalid] });

    await expect(harness.processor.runOnce()).resolves.toBe(1);
    expect(harness.retryOutbox).not.toHaveBeenCalled();
    expect(harness.deadLetterOutbox).toHaveBeenCalledWith({
      eventId: invalid.id,
      workerId: 'worker-1',
      errorCode: 'order_outbox_unsupported_event_type',
      errorMessage: 'The order outbox event is outside its durable contract.',
    });
  });

  it('dead-letters permanent Production rejections', async () => {
    const rejection = productionConflict({
      code: 'fulfillment_demand_diverged',
      message: 'diverged',
      safeMessage: 'The fulfillment demand conflicts with committed data.',
    });
    const harness = setup({
      project: async () => ({ tag: 'err', error: rejection }),
    });

    await expect(harness.processor.runOnce()).resolves.toBe(1);
    expect(harness.retryOutbox).not.toHaveBeenCalled();
    expect(harness.deadLetterOutbox).toHaveBeenCalledOnce();
  });

  it('reports the original structured failure when dead-lettering', async () => {
    const rejection = productionConflict({
      code: 'fulfillment_demand_diverged',
      message: 'diagnostic divergence',
      safeMessage: 'The fulfillment demand conflicts with committed data.',
    });
    const capture = vi.fn();
    const harness = setup({
      project: async () => ({ tag: 'err', error: rejection }),
      errors: { capture, shutdown: async () => undefined },
    });

    await expect(harness.processor.runOnce()).resolves.toBe(1);

    expect(capture).toHaveBeenCalledWith(
      productionFailureToAppError(rejection),
      expect.objectContaining({ operation: 'order_outbox' }),
    );
    expect(harness.deadLetterOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: rejection.code,
        errorMessage: rejection.safeMessage,
      }),
    );
  });

  it('does not let dead-letter reporting strand later outbox work', async () => {
    const rejection = productionConflict({
      code: 'fulfillment_demand_diverged',
      message: 'diagnostic divergence',
      safeMessage: 'The fulfillment demand conflicts with committed data.',
    });
    const project = vi
      .fn<ProductionApplication['applyFulfillmentDemand']>()
      .mockResolvedValueOnce({ tag: 'err', error: rejection })
      .mockResolvedValueOnce({
        tag: 'ok',
        value: {
          orderDemandId: '00000000-0000-4000-8000-000000000004',
          productionOrderId: '00000000-0000-4000-8000-000000000005',
          outcome: 'applied',
          replayed: false,
        },
      });
    const harness = setup({
      claimed: [event({ id: 'first' }), event({ id: 'second' })],
      project,
      errors: {
        capture: () => {
          throw new Error('reporter unavailable');
        },
        shutdown: async () => undefined,
      },
    });

    await expect(harness.processor.runOnce()).resolves.toBe(2);
    expect(harness.deadLetterOutbox).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'first' }),
    );
    expect(harness.completeOutbox).toHaveBeenCalledWith({
      eventId: 'second',
      workerId: 'worker-1',
    });
  });

  it('dead-letters a transient failure after the configured final attempt', async () => {
    const unavailable = makeAppError({
      kind: 'DatabaseError',
      code: 'production_unavailable',
      message: 'failed',
      safeMessage: 'Production is temporarily unavailable.',
      status: 503,
    });
    const harness = setup({
      claimed: [event({ attempts: 8 })],
      project: async () => {
        throw unavailable;
      },
    });

    await expect(harness.processor.runOnce()).resolves.toBe(1);
    expect(harness.retryOutbox).not.toHaveBeenCalled();
    expect(harness.deadLetterOutbox).toHaveBeenCalledOnce();
  });
});
