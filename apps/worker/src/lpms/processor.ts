import type { AppError } from '@pressly/errors';
import type { Logger } from '@pressly/logging';
import type {
  CounterSink,
  ErrorReporter,
  MeasurementSink,
} from '@pressly/metrics';
import type {
  ClaimedWebhookEvent,
  WebhookIngestionApplication,
} from '@pressly/webhook-ingestion';

export type WorkerClock = Readonly<{ now: () => Date }>;

export type EventConsumerOutcome =
  | Readonly<{ tag: 'ok' }>
  | Readonly<{ tag: 'err'; error: AppError; retryable: boolean }>;

export type WebhookEventConsumer = (
  event: ClaimedWebhookEvent,
) => Promise<EventConsumerOutcome>;

export const retryDelayMs = (input: {
  attempt: number;
  baseMs: number;
  maxMs: number;
  jitter: number;
}): number => {
  const exponential = Math.min(
    input.maxMs,
    input.baseMs * 2 ** Math.max(0, input.attempt - 1),
  );
  return Math.round(exponential * (0.75 + input.jitter * 0.5));
};

type IngestionWorkerPort = Pick<
  WebhookIngestionApplication,
  | 'measureBacklog'
  | 'claimEvents'
  | 'completeEvent'
  | 'retryEvent'
  | 'deadLetterEvent'
>;

export const makeInboxProcessor = (deps: {
  ingestion: IngestionWorkerPort;
  consume: WebhookEventConsumer;
  clock: WorkerClock;
  random: () => number;
  logger: Logger;
  counters: CounterSink;
  measurements: MeasurementSink;
  errors: ErrorReporter;
  config: Readonly<{
    workerId: string;
    leaseMs: number;
    batchSize: number;
    maxAttempts: number;
    retryBaseMs: number;
    retryMaxMs: number;
  }>;
}) => ({
  runOnce: async (): Promise<number> => {
    const backlog = await deps.ingestion.measureBacklog();
    deps.measurements.observe(
      'worker.inbox_oldest_pending_age_seconds',
      backlog.oldestPendingAgeSeconds,
      { job: 'webhook_ingestion' },
    );
    deps.measurements.observe(
      'worker.inbox_pending_count',
      backlog.pendingCount,
      { job: 'webhook_ingestion' },
    );
    const claimed = await deps.ingestion.claimEvents({
      workerId: deps.config.workerId,
      leaseMs: deps.config.leaseMs,
      limit: deps.config.batchSize,
    });

    for (const event of claimed) {
      if (event.recoveredLease) {
        deps.counters.increment('worker.leases_recovered', {
          job: 'webhook_ingestion',
        });
        deps.logger.warn('webhook event lease recovered', {
          eventId: event.eventId,
          source: event.source,
          attempt: event.attempt,
        });
      }

      const startedAt = deps.clock.now().getTime();
      const consumed = await deps.consume(event);
      deps.measurements.observe(
        'worker.processing_latency_seconds',
        Math.max(0, (deps.clock.now().getTime() - startedAt) / 1_000),
        { job: 'webhook_ingestion', source: event.source },
      );

      if (consumed.tag === 'ok') {
        const completion = await deps.ingestion.completeEvent(event);
        if (completion === 'lease_lost') {
          deps.counters.increment('worker.lease_losses', {
            job: 'webhook_ingestion',
            disposition: 'complete',
          });
          deps.logger.warn(
            'webhook event completion discarded after lease loss',
            {
              eventId: event.eventId,
              source: event.source,
              workerId: event.workerId,
              attempt: event.attempt,
              disposition: 'complete',
            },
          );
          continue;
        }
        deps.counters.increment('worker.jobs_completed', {
          job: 'webhook_ingestion',
          source: event.source,
        });
        continue;
      }

      const permanent =
        !consumed.retryable || event.attempt >= deps.config.maxAttempts;
      if (permanent) {
        const completion = await deps.ingestion.deadLetterEvent({
          eventId: event.eventId,
          workerId: event.workerId,
          attempt: event.attempt,
          code: consumed.error.code,
          message: consumed.error.safeMessage,
        });
        if (completion === 'lease_lost') {
          deps.counters.increment('worker.lease_losses', {
            job: 'webhook_ingestion',
            disposition: 'dead',
          });
          deps.logger.warn('webhook event failure discarded after lease loss', {
            eventId: event.eventId,
            source: event.source,
            workerId: event.workerId,
            attempt: event.attempt,
            disposition: 'dead',
          });
          continue;
        }
        deps.counters.increment('worker.jobs_failed', {
          job: 'webhook_ingestion',
          source: event.source,
          outcome: 'dead',
        });
        deps.counters.increment('worker.dead_letters', {
          job: 'webhook_ingestion',
          source: event.source,
          code: consumed.error.code,
        });
        deps.logger.error('webhook event dead-lettered', {
          eventId: event.eventId,
          source: event.source,
          code: consumed.error.code,
          attempt: event.attempt,
        });
        deps.errors.capture(consumed.error, {
          source: 'worker',
          operation: 'webhook_event_dead_letter',
          tags: {
            event_source: event.source,
            error_code: consumed.error.code,
            attempt: String(event.attempt),
          },
          extra: { eventId: event.eventId },
        });
        continue;
      }

      const delay = retryDelayMs({
        attempt: event.attempt,
        baseMs: deps.config.retryBaseMs,
        maxMs: deps.config.retryMaxMs,
        jitter: deps.random(),
      });
      const completion = await deps.ingestion.retryEvent({
        eventId: event.eventId,
        workerId: event.workerId,
        attempt: event.attempt,
        availableAt: new Date(deps.clock.now().getTime() + delay),
        code: consumed.error.code,
        message: consumed.error.safeMessage,
      });
      if (completion === 'lease_lost') {
        deps.counters.increment('worker.lease_losses', {
          job: 'webhook_ingestion',
          disposition: 'retry',
        });
        deps.logger.warn('webhook event retry discarded after lease loss', {
          eventId: event.eventId,
          source: event.source,
          workerId: event.workerId,
          attempt: event.attempt,
          disposition: 'retry',
        });
        continue;
      }
      deps.counters.increment('worker.jobs_retried', {
        job: 'webhook_ingestion',
        source: event.source,
      });
      deps.logger.warn('webhook event scheduled for retry', {
        eventId: event.eventId,
        source: event.source,
        code: consumed.error.code,
        attempt: event.attempt,
        delayMs: delay,
      });
    }

    return claimed.length;
  },
});

export type InboxProcessor = ReturnType<typeof makeInboxProcessor>;
