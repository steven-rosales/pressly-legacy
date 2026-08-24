import type { CentsSubmittedOrderCandidatePayload } from '@pressly/ingress-system/contracts/cents-v1';
import { validationError } from '@pressly/errors/factories';
import { makeProcessInboundEventCell } from '@pressly/ingress-system/operations/processing/process-inbound-event/cell';
import { processInboundEventContract } from '@pressly/ingress-system/operations/processing/process-inbound-event/contract';
import { processInboundEventJobSurface } from '@pressly/ingress-system/operations/processing/process-inbound-event/job';
import type { ClaimedWebhookEvent } from '@pressly/ingress-system/models/inbox';
import type {
  CloseIncomingOrderSourceCapability,
  ProcessInboundEventDependencies,
  ProposeIncomingOrderCapability,
  ResolveSourceClosedFulfillmentCapability,
  ResolveSourceLocationCapability,
} from '@pressly/ingress-system/operations/processing/process-inbound-event/types';
import type { IngressStateSystem } from '@pressly/ingress-system/testing/assembly';
import type { JobHostRegistration } from '@pressly/jobs-host';
import {
  makeDurableQueueJob,
  makeSequentialDurableJob,
  runDurableJobLoop,
  type DurableJobFailure,
  type DurableJobQueue,
} from '@pressly/jobs';
import { nullLogger } from '@pressly/logging';
import {
  nullCounterSink,
  nullErrorReporter,
  nullMeasurementSink,
} from '@pressly/observability';
import { describe, expect, it, vi } from 'vitest';
import {
  makeWebhookIngestionDurableQueue,
  observeProcessInboundEventRegistration,
} from '@pressly/ingress-system/capabilities/process-inbound-event-job';

const submitted = (): CentsSubmittedOrderCandidatePayload => ({
  externalOrderId: 'order-1',
  orderCode: '00123',
  externalStoreId: 'store-1',
  status: 'SUBMITTED',
  dueAt: '2026-07-10T20:00:00.000Z',
  sourceUpdatedAt: '2026-07-10T13:00:00.000Z',
  bagCount: null,
  totalAmountCents: 14_800,
  balanceDueCents: 14_800,
  services: [
    {
      externalServiceId: 'wash-fold',
      name: 'Wash and fold',
      category: 'LAUNDRY',
      quantity: 1,
      totalPriceCents: 14_800,
      unitPriceCents: 200,
    },
  ],
  customer: null,
});

const event = (
  sequence: number,
  overrides: Partial<ClaimedWebhookEvent> = {},
): ClaimedWebhookEvent => ({
  eventId: `83000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
  workerId: 'worker-1',
  attempt: 1,
  source: 'cents',
  eventType: 'order_updated',
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: new Date('2026-07-10T13:00:00.000Z'),
  receivedAt: new Date('2026-07-10T13:00:01.000Z'),
  payload: submitted(),
  payloadHash: 'a'.repeat(64),
  recoveredLease: false,
  ...overrides,
});

const processRegistration = (
  deps: ProcessInboundEventDependencies,
): JobHostRegistration => {
  const cell = makeProcessInboundEventCell(deps);
  return Object.freeze({
    operationId: cell.id,
    observability: cell.observability.operation,
    jobId: processInboundEventJobSurface.id,
    trigger: processInboundEventJobSurface.trigger,
    queue: processInboundEventJobSurface.queue,
    timeoutMs: cell.timeoutMs,
    retry: cell.retry,
    invoke: async (payload) => {
      const decoded = processInboundEventContract.input.decode(payload);
      if (decoded.kind === 'invalid')
        throw validationError({
          code: 'job_cell_input_invalid',
          message: 'The process-inbound-event job payload is invalid.',
          safeMessage: 'The job payload is invalid.',
          details: { issues: decoded.issues },
        });
      const outcome = await cell.execute(decoded.value);
      return outcome.kind === 'success'
        ? { kind: 'complete' as const }
        : {
            kind: 'reject' as const,
            failure: processInboundEventJobSurface.presentFailure(
              outcome.failure,
            ),
          };
    },
  });
};

const processDependencies = (
  overrides: Partial<ProcessInboundEventDependencies> = {},
): ProcessInboundEventDependencies => ({
  resolveSourceLocation:
    overrides.resolveSourceLocation ??
    vi.fn<ResolveSourceLocationCapability>(async () => ({
      kind: 'success',
      value: 'location-1',
    })),
  proposeIncomingOrder:
    overrides.proposeIncomingOrder ??
    vi.fn<ProposeIncomingOrderCapability>(async () => ({
      kind: 'success',
      value: { outcome: 'proposed' },
    })),
  closeIncomingOrderSource:
    overrides.closeIncomingOrderSource ??
    vi.fn<CloseIncomingOrderSourceCapability>(async () => ({
      kind: 'success',
      value: { canonical: null },
    })),
  resolveSourceClosedFulfillment:
    overrides.resolveSourceClosedFulfillment ??
    vi.fn<ResolveSourceClosedFulfillmentCapability>(async () => ({
      kind: 'success',
      value: { outcome: 'already_resolved' },
    })),
});

describe('selected target webhook execution', () => {
  it('preserves permanent failure codes and continues the claimed batch', async () => {
    const claimed = [
      event(1, { source: 'unknown' }),
      event(2, { payload: { status: 'SUBMITTED', malformed: true } }),
      event(3),
      event(4, { payload: { ...submitted(), status: 'IN_PROGRESS' } }),
    ];
    const claimEvents = {
      execute: vi.fn(async () => ({ kind: 'success', value: claimed })),
    };
    const completeEvent = {
      execute: vi.fn(async () => ({ kind: 'success', value: 'applied' })),
    };
    const retryEvent = {
      execute: vi.fn(async () => ({ kind: 'success', value: 'applied' })),
    };
    const deadLetterEvent = {
      execute: vi.fn<IngressStateSystem['cells']['deadLetterEvent']['execute']>(
        async () => ({ kind: 'success', value: 'applied' }),
      ),
    };
    const cells = {
      claimEvents,
      completeEvent,
      retryEvent,
      deadLetterEvent,
      measureWebhookBacklog: {
        execute: vi.fn(async () => ({
          kind: 'success',
          value: { pendingCount: 0, oldestPendingAgeSeconds: 0 },
        })),
      },
      purgeExpiredWebhookReceipts: {
        execute: vi.fn(async () => ({
          kind: 'success',
          value: { purgedCount: 0 },
        })),
      },
    } as unknown as IngressStateSystem['cells'];
    const proposeIncomingOrder = vi.fn<ProposeIncomingOrderCapability>(
      async () => ({
        kind: 'failure',
        failure: {
          kind: 'validation',
          code: 'incoming_order_proposal_invalid',
          message: 'The incoming Order candidate is incomplete.',
        },
      }),
    );
    const measurements = { observe: vi.fn() };
    const registration = observeProcessInboundEventRegistration({
      registration: processRegistration(
        processDependencies({ proposeIncomingOrder }),
      ),
      clock: { now: () => new Date('2026-08-22T16:00:00.000Z') },
      measurements,
    });
    const queue = makeWebhookIngestionDurableQueue({
      cells,
      workerId: 'worker-1',
      leaseMs: 30_000,
      batchSize: 20,
      backlogMeasurementIntervalMs: 60_000,
      nowNanoseconds: () => 0n,
      logger: nullLogger,
      counters: nullCounterSink,
      measurements: nullMeasurementSink,
      errors: nullErrorReporter,
    });
    const classifyUnexpected = vi.fn<(failure: unknown) => DurableJobFailure>(
      () => ({
        code: 'unexpected',
        message: 'Unexpected.',
        retryable: true,
      }),
    );

    await expect(
      makeDurableQueueJob({
        job: registration,
        queue,
        classifyUnexpected,
        retryBaseMs: 1_000,
        retryMaxMs: 300_000,
        now: () => new Date('2026-08-22T16:00:00.000Z'),
        nowNanoseconds: () => 0n,
        random: () => 0.5,
      }).runOnce(new AbortController().signal),
    ).resolves.toBe(4);

    expect(
      deadLetterEvent.execute.mock.calls.map(([command]) => command.code),
    ).toEqual([
      'webhook_event_consumer_missing',
      'cents_order_payload_invalid',
      'incoming_order_proposal_invalid',
    ]);
    expect(completeEvent.execute).toHaveBeenCalledWith({
      eventId: claimed[3]?.eventId,
      workerId: 'worker-1',
      attempt: 1,
    });
    expect(retryEvent.execute).not.toHaveBeenCalled();
    expect(classifyUnexpected).not.toHaveBeenCalled();
    expect(measurements.observe).toHaveBeenCalledTimes(4);
  });

  it('proves two max-eight registrations run webhook first then outbox in one loop and heartbeat', async () => {
    const trace: string[] = [];
    const controller = new AbortController();
    const registration = (
      queue: 'order_outbox' | 'webhook_ingestion',
    ): JobHostRegistration => ({
      operationId:
        queue === 'webhook_ingestion'
          ? 'ingress.process-inbound-event.v1'
          : 'production.apply-fulfillment-demand.v1',
      observability:
        queue === 'webhook_ingestion'
          ? 'ingress.process_inbound_event'
          : 'production.apply_fulfillment_demand',
      jobId:
        queue === 'webhook_ingestion'
          ? 'ingress.process-inbound-event-job.v1'
          : 'production.apply-fulfillment-demand-job.v2',
      trigger: 'message',
      queue,
      timeoutMs: null,
      retry: {
        maxAttempts: 8,
        strategy: 'bounded-exponential-jitter',
        deadLetter: 'retain',
      },
      invoke: async () => {
        trace.push(`${queue}:invoke`);
        return { kind: 'complete' };
      },
    });
    const queue = (
      id: 'order_outbox' | 'webhook_ingestion',
    ): DurableJobQueue => ({
      id,
      claim: async () => {
        trace.push(`${id}:claim`);
        return [
          {
            id: `${id}-delivery`,
            attempt: 1,
            receipt: {},
            resolution: { kind: 'invoke', payload: { source: 'cents' } },
          },
        ];
      },
      complete: async () => {
        trace.push(`${id}:complete`);
        return { kind: 'applied' };
      },
      retry: async () => ({ kind: 'applied' }),
      deadLetter: async () => ({ kind: 'applied' }),
      afterPass: async () => void trace.push(`${id}:after-pass`),
    });
    const webhook = registration('webhook_ingestion');
    const outbox = registration('order_outbox');
    expect(webhook.retry?.maxAttempts).toBe(8);
    expect(outbox.retry?.maxAttempts).toBe(8);
    const durable = (job: JobHostRegistration, durableQueue: DurableJobQueue) =>
      makeDurableQueueJob({
        job,
        queue: durableQueue,
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

    await runDurableJobLoop({
      job: makeSequentialDurableJob([
        durable(webhook, queue('webhook_ingestion')),
        durable(outbox, queue('order_outbox')),
      ]),
      pollIntervalMs: 1_000,
      retryBaseMs: 1_000,
      retryMaxMs: 30_000,
      signal: controller.signal,
      heartbeat: {
        beat: async () => {
          trace.push('heartbeat');
          controller.abort();
        },
      },
    });

    expect(trace).toEqual([
      'webhook_ingestion:claim',
      'webhook_ingestion:invoke',
      'webhook_ingestion:complete',
      'webhook_ingestion:after-pass',
      'order_outbox:claim',
      'order_outbox:invoke',
      'order_outbox:complete',
      'order_outbox:after-pass',
      'heartbeat',
    ]);
  });
});
