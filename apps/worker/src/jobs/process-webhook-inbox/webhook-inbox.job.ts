import {
  normalizeUnknownError,
  type AppError,
} from '@pressly/errors/app-error';
import { redactLogFields, type Logger, type LogFields } from '@pressly/logging';
import type { Clock } from '@pressly/time';
import {
  attemptObservation,
  isolateCounterSink,
  isolateMeasurementSink,
  type CounterSink,
  type ErrorReporter,
  type MeasurementSink,
} from '@pressly/observability';
import type {
  ClaimedWebhookEvent,
  WebhookIngestionApplication,
} from '@pressly/webhook-ingestion';
import {
  decideFailureDisposition,
  isRetryableAppError,
} from '../../runtime/failure-disposition.ts';
import { retryDelayMs } from '../../runtime/retry.ts';

export type EventConsumerOutcome =
  | Readonly<{ tag: 'ok' }>
  | Readonly<{ tag: 'err'; error: AppError; retryable: boolean }>;

export type WebhookEventConsumer = (
  event: ClaimedWebhookEvent,
) => Promise<EventConsumerOutcome>;

export { retryDelayMs } from '../../runtime/retry.ts';

type IngestionWorkerPort = Pick<
  WebhookIngestionApplication,
  | 'measureBacklog'
  | 'claimEvents'
  | 'completeEvent'
  | 'retryEvent'
  | 'deadLetterEvent'
  | 'purgeExpiredReceipts'
>;

export const makeWebhookInboxJob = (deps: {
  ingestion: IngestionWorkerPort;
  consume: WebhookEventConsumer;
  clock: Clock;
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
    backlogMeasurementIntervalMs: number;
  }>;
}) => {
  let lastBacklogMeasurementAttemptAt: number | null = null;
  const observe = (effect: () => void): void => {
    attemptObservation(effect);
  };
  const { increment } = isolateCounterSink(deps.counters);
  const { observe: measure } = isolateMeasurementSink(deps.measurements);
  const capture: ErrorReporter['capture'] = (error, context) =>
    observe(() => deps.errors.capture(error, context));
  const logInfo: Logger['info'] = (message, fields) =>
    observe(() => deps.logger.info(message, fields));
  const logWarn: Logger['warn'] = (message, fields) =>
    observe(() => deps.logger.warn(message, fields));
  const logError: Logger['error'] = (message, fields) =>
    observe(() => deps.logger.error(message, fields));

  const consumeEvent = async (
    event: ClaimedWebhookEvent,
  ): Promise<EventConsumerOutcome> => {
    const startedAt = deps.clock.now().getTime();
    try {
      return await deps.consume(event);
    } catch (error: unknown) {
      const normalized = normalizeUnknownError(error);
      return {
        tag: 'err',
        error: normalized,
        retryable: isRetryableAppError(normalized),
      };
    } finally {
      measure(
        'worker.processing_latency_seconds',
        Math.max(0, (deps.clock.now().getTime() - startedAt) / 1_000),
        { job: 'webhook_ingestion', source: event.source },
      );
    }
  };

  /**
   * One backlog query emits two distinct gauges: queue age and queue depth.
   * Their shared timestamp is one sample, not evidence of a second worker poll.
   * Sampling is best-effort and happens after claimed work is handled, so
   * observability cannot prevent the claim/process path from making progress.
   */
  const sampleBacklogIfDue = async (): Promise<void> => {
    const now = deps.clock.now().getTime();
    if (
      lastBacklogMeasurementAttemptAt !== null &&
      now - lastBacklogMeasurementAttemptAt <
        deps.config.backlogMeasurementIntervalMs
    )
      return;

    // Record attempts before I/O so a failing aggregate cannot be retried by the
    // one-second claim loop and create a database/logging failure storm.
    lastBacklogMeasurementAttemptAt = now;
    try {
      const backlog = await deps.ingestion.measureBacklog();
      measure(
        'worker.inbox_oldest_pending_age_seconds',
        backlog.oldestPendingAgeSeconds,
        { job: 'webhook_ingestion' },
      );
      measure('worker.inbox_pending_count', backlog.pendingCount, {
        job: 'webhook_ingestion',
      });
    } catch (error: unknown) {
      logWarn(
        'worker backlog measurement failed',
        redactLogFields({ error }) as LogFields,
      );
    }

    try {
      const purged = await deps.ingestion.purgeExpiredReceipts();
      if (purged.value.purgedCount > 0)
        logInfo('expired webhook quarantine receipts purged', {
          purgedCount: purged.value.purgedCount,
        });
    } catch (error: unknown) {
      logWarn(
        'webhook quarantine purge failed',
        redactLogFields({ error }) as LogFields,
      );
    }
  };

  return {
    runOnce: async (): Promise<number> => {
      // Claiming remains once per inbox pass; the slower backlog aggregate has
      // its own sampling cadence and never replaces this call.
      const claimed = await deps.ingestion.claimEvents({
        workerId: deps.config.workerId,
        leaseMs: deps.config.leaseMs,
        limit: deps.config.batchSize,
      });

      for (const event of claimed) {
        if (event.recoveredLease) {
          increment('worker.leases_recovered', {
            job: 'webhook_ingestion',
          });
          logWarn('webhook event lease recovered', {
            eventId: event.eventId,
            source: event.source,
            attempt: event.attempt,
          });
        }

        const consumed = await consumeEvent(event);

        if (consumed.tag === 'ok') {
          const completion = await deps.ingestion.completeEvent(event);
          if (completion === 'lease_lost') {
            increment('worker.lease_losses', {
              job: 'webhook_ingestion',
              disposition: 'complete',
            });
            logWarn('webhook event completion discarded after lease loss', {
              eventId: event.eventId,
              source: event.source,
              workerId: event.workerId,
              attempt: event.attempt,
              disposition: 'complete',
            });
            continue;
          }
          increment('worker.jobs_completed', {
            job: 'webhook_ingestion',
            source: event.source,
          });
          continue;
        }

        const disposition = decideFailureDisposition({
          retryable: consumed.retryable,
          attempt: event.attempt,
          maxAttempts: deps.config.maxAttempts,
        });
        if (disposition.action === 'dead_letter') {
          const completion = await deps.ingestion.deadLetterEvent({
            eventId: event.eventId,
            workerId: event.workerId,
            attempt: event.attempt,
            code: consumed.error.code,
            message: consumed.error.safeMessage,
          });
          if (completion === 'lease_lost') {
            increment('worker.lease_losses', {
              job: 'webhook_ingestion',
              disposition: 'dead',
            });
            logWarn('webhook event failure discarded after lease loss', {
              eventId: event.eventId,
              source: event.source,
              workerId: event.workerId,
              attempt: event.attempt,
              disposition: 'dead',
            });
            continue;
          }
          increment('worker.jobs_failed', {
            job: 'webhook_ingestion',
            source: event.source,
            outcome: 'dead',
          });
          increment('worker.dead_letters', {
            job: 'webhook_ingestion',
            source: event.source,
            code: consumed.error.code,
          });
          logError('webhook event dead-lettered', {
            eventId: event.eventId,
            source: event.source,
            code: consumed.error.code,
            attempt: event.attempt,
          });
          capture(consumed.error, {
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
          increment('worker.lease_losses', {
            job: 'webhook_ingestion',
            disposition: 'retry',
          });
          logWarn('webhook event retry discarded after lease loss', {
            eventId: event.eventId,
            source: event.source,
            workerId: event.workerId,
            attempt: event.attempt,
            disposition: 'retry',
          });
          continue;
        }
        increment('worker.jobs_retried', {
          job: 'webhook_ingestion',
          source: event.source,
        });
        logWarn('webhook event scheduled for retry', {
          eventId: event.eventId,
          source: event.source,
          code: consumed.error.code,
          attempt: event.attempt,
          delayMs: delay,
        });
      }

      await sampleBacklogIfDue();
      return claimed.length;
    },
  };
};

export type WebhookInboxJob = ReturnType<typeof makeWebhookInboxJob>;
