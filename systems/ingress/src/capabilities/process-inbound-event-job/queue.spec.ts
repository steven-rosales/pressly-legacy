import { makeAppError } from '@pressly/errors/app-error';
import type { ClaimedWebhookEvent } from '../../model/inbox.ts';
import type { IngressStateSystem } from '../../system.ts';
import { makeDurableQueueJob, type DurableJobFailure } from '@pressly/jobs';
import type { Logger } from '@pressly/logging';
import { describe, expect, it, vi } from 'vitest';
import { makeWebhookIngestionDurableQueue } from './queue.ts';
import { toWebhookIngestionDurableJobDelivery } from './delivery.ts';

const claimedEvent = (
  overrides: Partial<ClaimedWebhookEvent> = {},
): ClaimedWebhookEvent => ({
  eventId: '83000000-0000-4000-8000-000000000001',
  workerId: 'worker-1',
  attempt: 1,
  source: 'cents',
  eventType: 'order_updated',
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: new Date('2026-07-10T13:00:00.000Z'),
  receivedAt: new Date('2026-07-10T13:00:01.000Z'),
  payload: { status: 'IN_PROGRESS' },
  payloadHash: 'a'.repeat(64),
  recoveredLease: false,
  ...overrides,
});

type CellOverrides = Readonly<{
  claim?: () => Promise<unknown>;
  complete?: () => Promise<unknown>;
  retry?: () => Promise<unknown>;
  deadLetter?: () => Promise<unknown>;
  measure?: () => Promise<unknown>;
  purge?: () => Promise<unknown>;
  nowNanoseconds?: () => bigint;
}>;

const harness = (overrides: CellOverrides = {}) => {
  const claimEvents = {
    execute: vi.fn(
      overrides.claim ??
        (async () => ({ kind: 'success', value: [claimedEvent()] })),
    ),
  };
  const completeEvent = {
    execute: vi.fn(
      overrides.complete ??
        (async () => ({ kind: 'success', value: 'applied' })),
    ),
  };
  const retryEvent = {
    execute: vi.fn(
      overrides.retry ?? (async () => ({ kind: 'success', value: 'applied' })),
    ),
  };
  const deadLetterEvent = {
    execute: vi.fn(
      overrides.deadLetter ??
        (async () => ({ kind: 'success', value: 'applied' })),
    ),
  };
  const measureWebhookBacklog = {
    execute: vi.fn(
      overrides.measure ??
        (async () => ({
          kind: 'success',
          value: { pendingCount: 7, oldestPendingAgeSeconds: 90 },
        })),
    ),
  };
  const purgeExpiredWebhookReceipts = {
    execute: vi.fn(
      overrides.purge ??
        (async () => ({ kind: 'success', value: { purgedCount: 2 } })),
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
  const cells = {
    claimEvents,
    completeEvent,
    retryEvent,
    deadLetterEvent,
    measureWebhookBacklog,
    purgeExpiredWebhookReceipts,
  } as unknown as IngressStateSystem['cells'];
  const queue = makeWebhookIngestionDurableQueue({
    cells,
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
  });

  return {
    queue,
    claimEvents,
    completeEvent,
    retryEvent,
    deadLetterEvent,
    measureWebhookBacklog,
    purgeExpiredWebhookReceipts,
    logger,
    counters,
    measurements,
    errors,
  };
};

const retryableFailure: DurableJobFailure = {
  code: 'production_projection_pending',
  message: 'The fulfillment is waiting for its Production projection.',
  retryable: true,
  category: 'external_service',
  status: 503,
};

describe('Worker webhook ingestion durable queue adapter', () => {
  it('claims once in target order and records recovered leases before delivery', async () => {
    const first = claimedEvent({
      eventId: '83000000-0000-4000-8000-000000000001',
    });
    const recovered = claimedEvent({
      eventId: '83000000-0000-4000-8000-000000000002',
      subjectId: 'order-2',
      attempt: 3,
      recoveredLease: true,
    });
    const run = harness({
      claim: async () => ({ kind: 'success', value: [first, recovered] }),
    });

    await expect(
      run.queue.claim({ signal: new AbortController().signal }),
    ).resolves.toMatchObject([
      { id: first.eventId, attempt: 1 },
      {
        id: recovered.eventId,
        attempt: 3,
        receipt: {
          eventId: recovered.eventId,
          workerId: 'worker-1',
          attempt: 3,
          recoveredLease: true,
          source: 'cents',
        },
      },
    ]);
    expect(run.claimEvents.execute).toHaveBeenCalledWith({
      workerId: 'worker-1',
      leaseMs: 30_000,
      limit: 20,
    });
    expect(run.counters.increment).toHaveBeenCalledOnce();
    expect(run.counters.increment).toHaveBeenCalledWith(
      'worker.leases_recovered',
      { job: 'webhook_ingestion' },
    );
    expect(run.logger.warn).toHaveBeenCalledWith(
      'webhook event lease recovered',
      {
        eventId: recovered.eventId,
        source: 'cents',
        attempt: 3,
      },
    );
  });

  it('completes with the exact claim fence and success counter', async () => {
    const event = claimedEvent({ attempt: 2, recoveredLease: true });
    const delivery = toWebhookIngestionDurableJobDelivery(event);
    const run = harness();

    await expect(run.queue.complete(delivery)).resolves.toEqual({
      kind: 'applied',
    });
    expect(run.completeEvent.execute).toHaveBeenCalledWith({
      eventId: event.eventId,
      workerId: event.workerId,
      attempt: 2,
    });
    expect(run.counters.increment).toHaveBeenCalledWith(
      'worker.jobs_completed',
      { job: 'webhook_ingestion', source: 'cents' },
    );
  });

  it('schedules retry with the exact claim fence, code, message and delay log', async () => {
    const event = claimedEvent({ attempt: 2 });
    const delivery = toWebhookIngestionDurableJobDelivery(event);
    const availableAt = new Date('2026-08-22T16:00:01.500Z');
    const run = harness();

    await expect(
      run.queue.retry({
        delivery,
        availableAt,
        delayMs: 1_500,
        failure: retryableFailure,
      }),
    ).resolves.toEqual({ kind: 'applied' });
    expect(run.retryEvent.execute).toHaveBeenCalledWith({
      eventId: event.eventId,
      workerId: event.workerId,
      attempt: 2,
      availableAt,
      code: retryableFailure.code,
      message: retryableFailure.message,
    });
    expect(run.counters.increment).toHaveBeenCalledWith('worker.jobs_retried', {
      job: 'webhook_ingestion',
      source: 'cents',
    });
    expect(run.logger.warn).toHaveBeenCalledWith(
      'webhook event scheduled for retry',
      {
        eventId: event.eventId,
        source: 'cents',
        code: retryableFailure.code,
        attempt: 2,
        delayMs: 1_500,
      },
    );
  });

  it('retains a terminal failure with exact counters, log and capture context', async () => {
    const event = claimedEvent({ attempt: 8 });
    const delivery = toWebhookIngestionDurableJobDelivery(event);
    const failure: DurableJobFailure = {
      code: 'cents_order_payload_invalid',
      message: 'The stored Cents order payload is invalid.',
      retryable: false,
      category: 'validation',
      status: 422,
    };
    const run = harness();

    await expect(
      run.queue.deadLetter({ delivery, failure, retention: 'retain' }),
    ).resolves.toEqual({ kind: 'applied' });
    expect(run.deadLetterEvent.execute).toHaveBeenCalledWith({
      eventId: event.eventId,
      workerId: event.workerId,
      attempt: 8,
      code: failure.code,
      message: failure.message,
    });
    expect(run.counters.increment.mock.calls).toEqual([
      [
        'worker.jobs_failed',
        { job: 'webhook_ingestion', source: 'cents', outcome: 'dead' },
      ],
      [
        'worker.dead_letters',
        {
          job: 'webhook_ingestion',
          source: 'cents',
          code: failure.code,
        },
      ],
    ]);
    expect(run.logger.error).toHaveBeenCalledWith(
      'webhook event dead-lettered',
      {
        eventId: event.eventId,
        source: 'cents',
        code: failure.code,
        attempt: 8,
      },
    );
    expect(run.errors.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        code: failure.code,
        safeMessage: failure.message,
        status: 422,
      }),
      {
        source: 'worker',
        operation: 'webhook_event_dead_letter',
        tags: {
          event_source: 'cents',
          error_code: failure.code,
          attempt: '8',
        },
        extra: { eventId: event.eventId },
      },
    );
  });

  it.each([
    {
      name: 'complete',
      override: {
        complete: async () => ({ kind: 'success', value: 'lease_lost' }),
      },
      invoke: async (
        run: ReturnType<typeof harness>,
        delivery: ReturnType<typeof toWebhookIngestionDurableJobDelivery>,
      ) => run.queue.complete(delivery),
      message: 'webhook event completion discarded after lease loss',
    },
    {
      name: 'retry',
      override: {
        retry: async () => ({ kind: 'success', value: 'lease_lost' }),
      },
      invoke: async (
        run: ReturnType<typeof harness>,
        delivery: ReturnType<typeof toWebhookIngestionDurableJobDelivery>,
      ) =>
        run.queue.retry({
          delivery,
          availableAt: new Date('2026-08-22T16:00:01.000Z'),
          delayMs: 1_000,
          failure: retryableFailure,
        }),
      message: 'webhook event retry discarded after lease loss',
    },
    {
      name: 'dead',
      override: {
        deadLetter: async () => ({ kind: 'success', value: 'lease_lost' }),
      },
      invoke: async (
        run: ReturnType<typeof harness>,
        delivery: ReturnType<typeof toWebhookIngestionDurableJobDelivery>,
      ) =>
        run.queue.deadLetter({
          delivery,
          failure: { code: 'invalid', message: 'Invalid.', retryable: false },
          retention: 'retain',
        }),
      message: 'webhook event failure discarded after lease loss',
    },
  ])(
    'maps $name lease loss without recording a terminal transition',
    async ({ name, override, invoke, message }) => {
      const event = claimedEvent({ attempt: 3, recoveredLease: true });
      const run = harness(override);
      await expect(
        invoke(run, toWebhookIngestionDurableJobDelivery(event)),
      ).resolves.toEqual({ kind: 'lease-lost' });
      expect(run.counters.increment).toHaveBeenCalledOnce();
      expect(run.counters.increment).toHaveBeenCalledWith(
        'worker.lease_losses',
        { job: 'webhook_ingestion', disposition: name },
      );
      expect(run.logger.warn).toHaveBeenCalledWith(message, {
        eventId: event.eventId,
        source: 'cents',
        workerId: 'worker-1',
        attempt: 3,
        disposition: name,
      });
      expect(run.errors.capture).not.toHaveBeenCalled();
    },
  );

  it('runs backlog then purge on the deployed cadence and keeps both fail-open', async () => {
    const times = [0n, 30_000_000_000n, 60_000_000_000n];
    const trace: string[] = [];
    const run = harness({
      nowNanoseconds: () => times.shift() ?? 60_000_000_000n,
      measure: async () => {
        trace.push('measure');
        return {
          kind: 'success',
          value: { pendingCount: 7, oldestPendingAgeSeconds: 90 },
        };
      },
      purge: async () => {
        trace.push('purge');
        return { kind: 'success', value: { purgedCount: 2 } };
      },
    });
    run.measurements.observe.mockImplementation((name) => trace.push(name));
    vi.mocked(run.logger.info).mockImplementation(
      (message) => void trace.push(message),
    );

    await run.queue.afterPass?.();
    await run.queue.afterPass?.();
    await run.queue.afterPass?.();

    expect(trace).toEqual([
      'measure',
      'worker.inbox_oldest_pending_age_seconds',
      'worker.inbox_pending_count',
      'purge',
      'expired webhook quarantine receipts purged',
      'measure',
      'worker.inbox_oldest_pending_age_seconds',
      'worker.inbox_pending_count',
      'purge',
      'expired webhook quarantine receipts purged',
    ]);
    expect(run.measureWebhookBacklog.execute).toHaveBeenCalledTimes(2);
    expect(run.purgeExpiredWebhookReceipts.execute).toHaveBeenCalledTimes(2);
  });

  it('purges after a failed backlog sample and isolates a purge failure', async () => {
    const trace: string[] = [];
    const run = harness({
      measure: async () => {
        trace.push('measure-failed');
        throw { fault: 'backlog unavailable' };
      },
      purge: async () => {
        trace.push('purge-failed');
        throw { fault: 'purge unavailable' };
      },
    });

    await expect(run.queue.afterPass?.()).resolves.toBeUndefined();
    expect(trace).toEqual(['measure-failed', 'purge-failed']);
    expect(run.logger.warn).toHaveBeenCalledWith(
      'worker backlog measurement failed',
      expect.any(Object),
    );
    expect(run.logger.warn).toHaveBeenCalledWith(
      'webhook quarantine purge failed',
      expect.any(Object),
    );
  });

  it('runs its maintenance after a failed claim without replacing that failure', async () => {
    const claimFailure = makeAppError({
      kind: 'DatabaseError',
      code: 'webhook_event_claim_failed',
      message: 'Webhook events could not be claimed.',
      safeMessage: 'Webhook events could not be claimed.',
      status: 503,
    });
    const run = harness({
      claim: async () => Promise.reject(claimFailure),
      nowNanoseconds: () => 0n,
    });
    const job = makeDurableQueueJob({
      job: {
        jobId: 'ingress.process-inbound-event-job.v1',
        timeoutMs: null,
        retry: {
          maxAttempts: 8,
          strategy: 'bounded-exponential-jitter',
          deadLetter: 'retain',
        },
        invoke: async () => ({ kind: 'complete' }),
      },
      queue: run.queue,
      classifyUnexpected: () => ({
        code: 'unexpected',
        message: 'Unexpected.',
        retryable: true,
      }),
      retryBaseMs: 1_000,
      retryMaxMs: 300_000,
      now: () => new Date('2026-08-22T16:00:00.000Z'),
      nowNanoseconds: () => 0n,
      random: () => 0.5,
    });

    await expect(job.runOnce(new AbortController().signal)).rejects.toBe(
      claimFailure,
    );
    expect(run.measureWebhookBacklog.execute).toHaveBeenCalledOnce();
    expect(run.purgeExpiredWebhookReceipts.execute).toHaveBeenCalledOnce();
  });

  it('fails closed for a forged receipt or discard policy', async () => {
    const run = harness();
    const delivery = toWebhookIngestionDurableJobDelivery(claimedEvent());
    await expect(
      run.queue.complete({
        ...delivery,
        receipt: { ...delivery.receipt, attempt: 7 },
      }),
    ).rejects.toMatchObject({
      code: 'webhook_ingestion_delivery_receipt_invalid',
    });
    await expect(
      run.queue.deadLetter({
        delivery,
        failure: { code: 'invalid', message: 'Invalid.', retryable: false },
        retention: 'discard',
      }),
    ).rejects.toMatchObject({
      code: 'webhook_ingestion_dead_letter_retention_invalid',
    });
  });

  it('preserves an unexpected reportable failure at terminal capture', async () => {
    const reportable = makeAppError({
      kind: 'DatabaseError',
      code: 'database_unavailable',
      message: 'Database unavailable.',
      safeMessage: 'Database unavailable.',
      status: 503,
    });
    const run = harness();
    await run.queue.deadLetter({
      delivery: toWebhookIngestionDurableJobDelivery(claimedEvent()),
      failure: {
        code: reportable.code,
        message: reportable.safeMessage,
        retryable: true,
        reportable,
      } as DurableJobFailure,
      retention: 'retain',
    });
    expect(run.errors.capture.mock.calls[0]?.[0]).toBe(reportable);
  });
});
