import type { OrdersSystem } from '../../system.ts';
import type { Logger } from '@pressly/logging';
import { describe, expect, it, vi } from 'vitest';
import { makeOrderOutboxDurableQueue } from './queue.ts';

const claimedEvent = () => ({
  id: '00000000-0000-4000-8000-000000000001',
  orderId: '00000000-0000-4000-8000-000000000002',
  fulfillmentId: '00000000-0000-4000-8000-000000000003',
  aggregateVersion: 1,
  attempts: 1,
  leaseOwner: 'worker-1',
  leaseExpiresAt: new Date('2026-08-22T16:00:30.000Z'),
  kind: 'fulfillment_demand_changed' as const,
  eventType: 'fulfillment_demand_changed' as const,
  payload: {
    schemaVersion: 2 as const,
    eventType: 'fulfillment_demand_changed' as const,
    fulfillmentId: '00000000-0000-4000-8000-000000000003',
    displayNumber: 'P-100',
    locationId: 'location-1',
    typeCode: 'wash_fold',
    admissionState: 'released' as const,
    commercialState: 'open' as const,
    dueAt: new Date('2026-08-23T20:00:00.000Z'),
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'source_estimate',
    version: 1,
    observedAt: new Date('2026-08-22T15:00:00.000Z'),
  },
});

const harness = (
  overrides: {
    claim?: () => Promise<unknown>;
    complete?: () => Promise<unknown>;
    retry?: () => Promise<unknown>;
    deadLetter?: () => Promise<unknown>;
    measure?: () => Promise<unknown>;
    nowNanoseconds?: () => bigint;
  } = {},
) => {
  const claimOrderOutbox = {
    execute: vi.fn(
      overrides.claim ??
        (async () => ({ kind: 'success', value: [claimedEvent()] })),
    ),
  };
  const completeOrderOutbox = {
    execute: vi.fn(
      overrides.complete ??
        (async () => ({
          kind: 'success',
          value: { completed: true },
        })),
    ),
  };
  const retryOrderOutbox = {
    execute: vi.fn(
      overrides.retry ??
        (async () => ({ kind: 'success', value: { retried: true } })),
    ),
  };
  const deadLetterOrderOutbox = {
    execute: vi.fn(
      overrides.deadLetter ??
        (async () => ({
          kind: 'success',
          value: { deadLettered: true },
        })),
    ),
  };
  const measureOrderOutboxBacklog = {
    execute: vi.fn(
      overrides.measure ??
        (async () => ({
          kind: 'success',
          value: { pendingCount: 7, oldestPendingAgeSeconds: 90 },
        })),
    ),
  };
  const logger: Logger = {
    child: () => logger,
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  };
  const counters = { increment: vi.fn() };
  const measurements = { observe: vi.fn() };
  const errors = { capture: vi.fn(), shutdown: vi.fn() };
  const queue = makeOrderOutboxDurableQueue({
    cells: {
      claimOrderOutbox,
      completeOrderOutbox,
      retryOrderOutbox,
      deadLetterOrderOutbox,
      measureOrderOutboxBacklog,
    } as unknown as Pick<
      OrdersSystem['cells'],
      | 'claimOrderOutbox'
      | 'completeOrderOutbox'
      | 'retryOrderOutbox'
      | 'deadLetterOrderOutbox'
      | 'measureOrderOutboxBacklog'
    >,
    workerId: 'worker-1',
    leaseMs: 30_000,
    batchSize: 20,
    backlogMeasurementIntervalMs: 60_000,
    ...(overrides.nowNanoseconds === undefined
      ? {}
      : { nowNanoseconds: overrides.nowNanoseconds }),
    logger,
    counters,
    measurements,
    errors,
    toDelivery: (event) => ({
      id: event.id,
      attempt: event.attempts,
      receipt: { eventId: event.id, workerId: event.leaseOwner },
      resolution: { kind: 'invoke', payload: { fulfillment: event.id } },
    }),
  });
  return {
    queue,
    claimOrderOutbox,
    completeOrderOutbox,
    retryOrderOutbox,
    deadLetterOrderOutbox,
    measureOrderOutboxBacklog,
    logger,
    counters,
    measurements,
    errors,
  };
};

const delivery = () => ({
  id: claimedEvent().id,
  attempt: 1,
  receipt: { eventId: claimedEvent().id, workerId: 'worker-1' },
  resolution: { kind: 'complete-without-invoke' as const },
});

describe('Worker Order outbox durable queue adapter', () => {
  it('claims through the target cell and maps the delivery once', async () => {
    const run = harness();
    await expect(
      run.queue.claim({ signal: new AbortController().signal }),
    ).resolves.toMatchObject([
      {
        id: claimedEvent().id,
        attempt: 1,
        receipt: { eventId: claimedEvent().id, workerId: 'worker-1' },
        resolution: { kind: 'invoke' },
      },
    ]);
    expect(run.claimOrderOutbox.execute).toHaveBeenCalledWith({
      workerId: 'worker-1',
      limit: 20,
      leaseMs: 30_000,
    });
  });

  it('samples backlog at the deployed one-minute cadence and stays fail-open', async () => {
    const samples = [0n, 30_000_000_000n, 61_000_000_000n];
    const run = harness({ nowNanoseconds: () => samples.shift() ?? 61n });
    const signal = new AbortController().signal;
    await run.queue.claim({ signal });
    await run.queue.afterPass?.();
    await run.queue.claim({ signal });
    await run.queue.afterPass?.();
    await run.queue.claim({ signal });
    await run.queue.afterPass?.();
    expect(run.measureOrderOutboxBacklog.execute).toHaveBeenCalledTimes(2);
    expect(run.measurements.observe).toHaveBeenCalledWith(
      'worker.outbox_pending_count',
      7,
      { job: 'order_outbox' },
    );
    expect(run.measurements.observe).toHaveBeenCalledWith(
      'worker.outbox_oldest_pending_age_seconds',
      90,
      { job: 'order_outbox' },
    );

    const unavailable = harness({
      measure: async () => {
        throw { fault: 'database unavailable' };
      },
    });
    await expect(unavailable.queue.claim({ signal })).resolves.toHaveLength(1);
    await expect(unavailable.queue.afterPass?.()).resolves.toBeUndefined();
    expect(unavailable.logger.warn).toHaveBeenCalledWith(
      'order outbox backlog measurement failed',
      expect.any(Object),
    );
  });

  it('maps completion success and lease loss to exact telemetry', async () => {
    const success = harness();
    await expect(success.queue.complete(delivery())).resolves.toEqual({
      kind: 'applied',
    });
    expect(success.counters.increment).toHaveBeenCalledWith(
      'worker.jobs_completed',
      { job: 'order_outbox' },
    );

    const lost = harness({
      complete: async () => ({
        kind: 'success',
        value: { completed: false },
      }),
    });
    await expect(lost.queue.complete(delivery())).resolves.toEqual({
      kind: 'lease-lost',
    });
    expect(lost.logger.warn).toHaveBeenCalledWith(
      'order outbox completion discarded after lease loss',
      { eventId: claimedEvent().id, workerId: 'worker-1' },
    );
  });

  it('maps retry success and lease loss with the deployed code label', async () => {
    const failure = {
      code: 'database_unavailable',
      message: 'Database unavailable.',
      retryable: true,
    };
    const availableAt = new Date('2026-08-22T16:01:00.000Z');
    const success = harness();
    await expect(
      success.queue.retry({
        delivery: delivery(),
        availableAt,
        delayMs: 60_000,
        failure,
      }),
    ).resolves.toEqual({ kind: 'applied' });
    expect(success.retryOrderOutbox.execute).toHaveBeenCalledWith({
      eventId: claimedEvent().id,
      workerId: 'worker-1',
      availableAt,
      errorCode: failure.code,
      errorMessage: failure.message,
    });
    expect(success.counters.increment).toHaveBeenCalledWith(
      'worker.jobs_retried',
      { job: 'order_outbox', code: failure.code },
    );

    const lost = harness({
      retry: async () => ({ kind: 'success', value: { retried: false } }),
    });
    await expect(
      lost.queue.retry({
        delivery: delivery(),
        availableAt,
        delayMs: 60_000,
        failure,
      }),
    ).resolves.toEqual({ kind: 'lease-lost' });
    expect(lost.logger.warn).toHaveBeenCalledWith(
      'order outbox retry discarded after lease loss',
      { eventId: claimedEvent().id, workerId: 'worker-1' },
    );
  });

  it('retains dead letters and preserves exact logging counters and capture', async () => {
    const run = harness();
    const failure = {
      code: 'order_outbox_invalid_payload',
      message: 'The order outbox event is outside its durable contract.',
      retryable: false,
    };
    await expect(
      run.queue.deadLetter({
        delivery: delivery(),
        failure,
        retention: 'retain',
      }),
    ).resolves.toEqual({ kind: 'applied' });
    expect(run.logger.error).toHaveBeenCalledWith(
      'order outbox event dead-lettered',
      { eventId: claimedEvent().id, code: failure.code },
    );
    expect(run.counters.increment).toHaveBeenCalledWith('worker.dead_letters', {
      job: 'order_outbox',
      code: failure.code,
    });
    expect(run.counters.increment).toHaveBeenCalledWith('worker.jobs_failed', {
      job: 'order_outbox',
      code: failure.code,
    });
    expect(run.errors.capture).toHaveBeenCalledWith(
      expect.objectContaining({ code: failure.code }),
      {
        source: 'worker',
        operation: 'order_outbox',
        tags: { code: failure.code },
        extra: { eventId: claimedEvent().id },
      },
    );
  });

  it('reconstructs an external-service presentation for dead-letter reporting', async () => {
    const run = harness();
    const failure = {
      code: 'production_projection_pending',
      message: 'The Production projection is not ready.',
      retryable: true,
      category: 'external_service' as const,
      status: 503,
    };

    await run.queue.deadLetter({
      delivery: delivery(),
      failure,
      retention: 'retain',
    });

    expect(run.errors.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'ExternalServiceError',
        status: 503,
        code: 'production_projection_pending',
      }),
      expect.any(Object),
    );
  });

  it('reports dead-letter lease loss without terminal telemetry', async () => {
    const run = harness({
      deadLetter: async () => ({
        kind: 'success',
        value: { deadLettered: false },
      }),
    });
    await expect(
      run.queue.deadLetter({
        delivery: delivery(),
        failure: { code: 'invalid', message: 'Invalid.', retryable: false },
        retention: 'retain',
      }),
    ).resolves.toEqual({ kind: 'lease-lost' });
    expect(run.logger.warn).toHaveBeenCalledWith(
      'order outbox dead-letter discarded after lease loss',
      { eventId: claimedEvent().id, workerId: 'worker-1' },
    );
    expect(run.errors.capture).not.toHaveBeenCalled();
  });

  it('fails closed for an invalid receipt or incompatible discard policy', async () => {
    const run = harness();
    await expect(
      run.queue.complete({ ...delivery(), receipt: null }),
    ).rejects.toMatchObject({
      code: 'order_outbox_delivery_receipt_invalid',
    });
    await expect(
      run.queue.deadLetter({
        delivery: delivery(),
        failure: { code: 'invalid', message: 'Invalid.', retryable: false },
        retention: 'discard',
      }),
    ).rejects.toMatchObject({
      code: 'order_outbox_dead_letter_retention_invalid',
    });
  });
});
