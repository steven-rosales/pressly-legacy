import { makeAppError } from '@pressly/errors';
import { nullLogger } from '@pressly/logging';
import {
  nullCounterSink,
  nullErrorReporter,
  nullMeasurementSink,
  type MeasurementSink,
} from '@pressly/metrics';
import type {
  ClaimedWebhookEvent,
  WebhookIngestionApplication,
} from '@pressly/webhook-ingestion';
import { describe, expect, it, vi } from 'vitest';
import {
  makeWebhookInboxJob,
  retryDelayMs,
  type WebhookEventConsumer,
} from '../../../src/jobs/process-webhook-inbox/webhook-inbox.job.ts';

const claimedEvent = (
  overrides: Partial<ClaimedWebhookEvent> = {},
): ClaimedWebhookEvent => ({
  eventId: '00000000-0000-4000-8000-000000000001',
  workerId: 'worker-1',
  attempt: 1,
  source: 'cents',
  eventType: 'order_updated',
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: '2026-07-10T13:00:00.000Z',
  receivedAt: '2026-07-10T13:00:01.000Z',
  payload: {},
  payloadHash: 'a'.repeat(64),
  recoveredLease: false,
  ...overrides,
});

type WorkerIngestion = Pick<
  WebhookIngestionApplication,
  | 'measureBacklog'
  | 'claimEvents'
  | 'completeEvent'
  | 'retryEvent'
  | 'deadLetterEvent'
  | 'purgeExpiredReceipts'
>;

const ingestion = (
  claimed: readonly ClaimedWebhookEvent[],
  overrides: Partial<WorkerIngestion> = {},
) => ({
  measureBacklog: vi.fn(async () => ({
    pendingCount: claimed.length,
    oldestPendingAgeSeconds: 42,
  })),
  claimEvents: vi.fn(async () => claimed),
  completeEvent: vi.fn(async () => 'applied' as const),
  retryEvent: vi.fn(async () => 'applied' as const),
  deadLetterEvent: vi.fn(async () => 'applied' as const),
  purgeExpiredReceipts: vi.fn(async () => ({
    tag: 'ok' as const,
    value: { purgedCount: 0 },
  })),
  ...overrides,
});

const processor = (input: {
  ingestion: WorkerIngestion;
  consume: WebhookEventConsumer;
  clock?: Readonly<{ now: () => Date }>;
  measurements?: MeasurementSink;
  backlogMeasurementIntervalMs?: number;
}) =>
  makeWebhookInboxJob({
    ingestion: input.ingestion,
    consume: input.consume,
    clock:
      input.clock ??
      ({ now: () => new Date('2026-07-10T14:00:00.000Z') } as const),
    random: () => 0.5,
    logger: nullLogger,
    counters: nullCounterSink,
    measurements: input.measurements ?? nullMeasurementSink,
    errors: nullErrorReporter,
    config: {
      workerId: 'worker-1',
      leaseMs: 30_000,
      batchSize: 20,
      maxAttempts: 8,
      retryBaseMs: 1_000,
      retryMaxMs: 300_000,
      backlogMeasurementIntervalMs:
        input.backlogMeasurementIntervalMs ?? 60_000,
    },
  });

const failure = (retryable: boolean) => ({
  tag: 'err' as const,
  retryable,
  error: makeAppError({
    kind: 'DatabaseError',
    code: retryable ? 'database_unavailable' : 'invalid_order',
    message: 'failed',
    safeMessage: 'failed',
    status: retryable ? 503 : 422,
  }),
});

describe('generic webhook inbox processor', () => {
  it('uses bounded exponential backoff with symmetric jitter', () => {
    expect(
      retryDelayMs({ attempt: 1, baseMs: 1_000, maxMs: 5_000, jitter: 0 }),
    ).toBe(750);
    expect(
      retryDelayMs({ attempt: 10, baseMs: 1_000, maxMs: 5_000, jitter: 1 }),
    ).toBe(6_250);
  });

  it('completes only after the consumer succeeds', async () => {
    const event = claimedEvent();
    const store = ingestion([event]);
    const consume = vi.fn(async () => ({ tag: 'ok' as const }));
    await expect(
      processor({ ingestion: store, consume }).runOnce(),
    ).resolves.toBe(1);
    expect(consume).toHaveBeenCalledWith(event);
    expect(store.completeEvent).toHaveBeenCalledWith(event);
    expect(store.retryEvent).not.toHaveBeenCalled();
    expect(store.deadLetterEvent).not.toHaveBeenCalled();
  });

  it('samples two backlog gauges without changing the claim cadence', async () => {
    let now = new Date('2026-07-10T14:00:00.000Z');
    const store = ingestion([]);
    const observe = vi.fn();
    const inbox = processor({
      ingestion: store,
      consume: vi.fn(async () => ({ tag: 'ok' as const })),
      clock: { now: () => now },
      measurements: { observe },
    });

    await inbox.runOnce();
    await inbox.runOnce();
    now = new Date('2026-07-10T14:01:00.000Z');
    await inbox.runOnce();

    expect(store.claimEvents).toHaveBeenCalledTimes(3);
    expect(store.measureBacklog).toHaveBeenCalledTimes(2);
    expect(store.purgeExpiredReceipts).toHaveBeenCalledTimes(2);
    expect(observe.mock.calls).toEqual([
      [
        'worker.inbox_oldest_pending_age_seconds',
        42,
        { job: 'webhook_ingestion' },
      ],
      ['worker.inbox_pending_count', 0, { job: 'webhook_ingestion' }],
      [
        'worker.inbox_oldest_pending_age_seconds',
        42,
        { job: 'webhook_ingestion' },
      ],
      ['worker.inbox_pending_count', 0, { job: 'webhook_ingestion' }],
    ]);
  });

  it('does not let backlog telemetry failure block claimed work', async () => {
    const event = claimedEvent();
    const store = ingestion([event], {
      measureBacklog: vi.fn(async () => {
        throw new Error('aggregate timed out');
      }),
    });
    const consume = vi.fn(async () => ({ tag: 'ok' as const }));
    const inbox = processor({ ingestion: store, consume });

    await expect(inbox.runOnce()).resolves.toBe(1);
    await expect(inbox.runOnce()).resolves.toBe(1);

    expect(store.claimEvents).toHaveBeenCalledTimes(2);
    expect(store.measureBacklog).toHaveBeenCalledOnce();
    expect(store.purgeExpiredReceipts).toHaveBeenCalledOnce();
    expect(consume).toHaveBeenCalledTimes(2);
    expect(store.completeEvent).toHaveBeenCalledTimes(2);
  });

  it('retries transient failures and dead-letters permanent failures', async () => {
    const transient = claimedEvent({ eventId: 'transient', attempt: 2 });
    const permanent = claimedEvent({ eventId: 'permanent' });
    const store = ingestion([transient, permanent]);
    const consume = vi.fn(async (event: ClaimedWebhookEvent) =>
      failure(event.eventId === 'transient'),
    );
    await processor({ ingestion: store, consume }).runOnce();
    expect(store.retryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'transient',
        code: 'database_unavailable',
      }),
    );
    expect(store.deadLetterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'permanent', code: 'invalid_order' }),
    );
    expect(store.completeEvent).not.toHaveBeenCalled();
  });

  it('leaves the claim processing when completion crashes after domain commit', async () => {
    const event = claimedEvent();
    const completeEvent = vi.fn(async () => {
      throw new Error('completion database unavailable');
    });
    const store = ingestion([event], { completeEvent });
    const consume = vi.fn(async () => ({ tag: 'ok' as const }));
    await expect(
      processor({ ingestion: store, consume }).runOnce(),
    ).rejects.toThrow('completion database unavailable');
    expect(store.retryEvent).not.toHaveBeenCalled();
    expect(store.deadLetterEvent).not.toHaveBeenCalled();
  });

  it('does not regress state when a completion loses its lease', async () => {
    const event = claimedEvent({ recoveredLease: true, attempt: 2 });
    const store = ingestion([event], {
      completeEvent: vi.fn(async () => 'lease_lost' as const),
    });
    await expect(
      processor({
        ingestion: store,
        consume: vi.fn(async () => ({ tag: 'ok' as const })),
      }).runOnce(),
    ).resolves.toBe(1);
    expect(store.retryEvent).not.toHaveBeenCalled();
    expect(store.deadLetterEvent).not.toHaveBeenCalled();
  });
});
