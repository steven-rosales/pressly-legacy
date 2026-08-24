import { isAppError, type AppError } from '@pressly/errors/app-error';
import {
  configError,
  conflictError,
  externalServiceError,
  invariantViolationError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import type { IngressStateSystem } from '../../system.ts';
import type {
  ClaimedDurableJobDelivery,
  DurableJobFailure,
  DurableJobQueue,
  DurableJobTransitionOutcome,
} from '@pressly/jobs';
import { redactLogFields, type Logger, type LogFields } from '@pressly/logging';
import {
  attemptObservation,
  isolateCounterSink,
  isolateMeasurementSink,
  type CounterSink,
  type ErrorReporter,
  type MeasurementSink,
} from '@pressly/observability';
import {
  toWebhookIngestionDurableJobDelivery,
  type WebhookIngestionDeliveryReceipt,
} from './delivery.ts';

type WebhookIngestionCells = Pick<
  IngressStateSystem['cells'],
  | 'claimEvents'
  | 'completeEvent'
  | 'deadLetterEvent'
  | 'measureWebhookBacklog'
  | 'purgeExpiredWebhookReceipts'
  | 'retryEvent'
>;

type ReportableDurableJobFailure = DurableJobFailure &
  Readonly<{ reportable?: AppError }>;

const applied: DurableJobTransitionOutcome = Object.freeze({ kind: 'applied' });
const leaseLost: DurableJobTransitionOutcome = Object.freeze({
  kind: 'lease-lost',
});

const receiptFrom = (
  delivery: ClaimedDurableJobDelivery,
): WebhookIngestionDeliveryReceipt => {
  const receipt = delivery.receipt;
  if (
    typeof receipt === 'object' &&
    receipt !== null &&
    'eventId' in receipt &&
    typeof receipt.eventId === 'string' &&
    receipt.eventId === delivery.id &&
    'workerId' in receipt &&
    typeof receipt.workerId === 'string' &&
    'attempt' in receipt &&
    typeof receipt.attempt === 'number' &&
    Number.isInteger(receipt.attempt) &&
    receipt.attempt > 0 &&
    receipt.attempt === delivery.attempt &&
    'recoveredLease' in receipt &&
    typeof receipt.recoveredLease === 'boolean' &&
    'source' in receipt &&
    typeof receipt.source === 'string'
  )
    return Object.freeze({
      eventId: receipt.eventId,
      workerId: receipt.workerId,
      attempt: receipt.attempt,
      recoveredLease: receipt.recoveredLease,
      source: receipt.source,
    });

  throw invariantViolationError({
    code: 'webhook_ingestion_delivery_receipt_invalid',
    message: 'The claimed webhook ingestion delivery receipt is invalid.',
    safeMessage: 'Webhook ingestion delivery data is inconsistent.',
  });
};

const reportableFailure = (failure: DurableJobFailure): AppError => {
  const reportable = Reflect.get(
    failure as ReportableDurableJobFailure,
    'reportable',
  );
  if (isAppError(reportable)) return reportable;

  const fields = {
    code: failure.code,
    message: failure.message,
    safeMessage: failure.message,
  };
  switch (failure.category) {
    case 'validation':
      return validationError({
        ...fields,
        status: failure.status === 422 ? 422 : 400,
      });
    case 'conflict':
      return conflictError(fields);
    case 'not_found':
      return notFoundError(fields);
    case 'external_service':
      return externalServiceError({
        ...fields,
        status:
          failure.status === 502 ||
          failure.status === 503 ||
          failure.status === 504
            ? failure.status
            : 503,
      });
    case 'invariant':
      return invariantViolationError(fields);
    case undefined:
      return invariantViolationError(fields);
  }

  return invariantViolationError(fields);
};

export const makeWebhookIngestionDurableQueue = (input: {
  cells: WebhookIngestionCells;
  workerId: string;
  leaseMs: number;
  batchSize: number;
  backlogMeasurementIntervalMs: number;
  nowNanoseconds?: () => bigint;
  logger: Logger;
  counters: CounterSink;
  measurements: MeasurementSink;
  errors: ErrorReporter;
}): DurableJobQueue => {
  const nowNanoseconds = input.nowNanoseconds ?? process.hrtime.bigint;
  const backlogMeasurementIntervalNanoseconds =
    BigInt(input.backlogMeasurementIntervalMs) * 1_000_000n;
  let lastBacklogMeasurementAttemptAt: bigint | undefined;
  const { increment } = isolateCounterSink(input.counters);
  const { observe: measure } = isolateMeasurementSink(input.measurements);
  const logInfo: Logger['info'] = (message, fields) =>
    attemptObservation(() => input.logger.info(message, fields));
  const logWarn: Logger['warn'] = (message, fields) =>
    attemptObservation(() => input.logger.warn(message, fields));
  const logError: Logger['error'] = (message, fields) =>
    attemptObservation(() => input.logger.error(message, fields));
  const capture: ErrorReporter['capture'] = (error, context) =>
    attemptObservation(() => input.errors.capture(error, context));

  const sampleBacklogAndPurgeIfDue = async (): Promise<void> => {
    try {
      const now = nowNanoseconds();
      if (
        lastBacklogMeasurementAttemptAt !== undefined &&
        now - lastBacklogMeasurementAttemptAt <
          backlogMeasurementIntervalNanoseconds
      )
        return;

      lastBacklogMeasurementAttemptAt = now;
      const outcome = await input.cells.measureWebhookBacklog.execute({});
      if (outcome.kind === 'failure') throw outcome.failure;
      measure(
        'worker.inbox_oldest_pending_age_seconds',
        outcome.value.oldestPendingAgeSeconds,
        { job: 'webhook_ingestion' },
      );
      measure('worker.inbox_pending_count', outcome.value.pendingCount, {
        job: 'webhook_ingestion',
      });
    } catch (error: unknown) {
      logWarn(
        'worker backlog measurement failed',
        redactLogFields({ error }) as LogFields,
      );
    }

    try {
      const outcome = await input.cells.purgeExpiredWebhookReceipts.execute({});
      if (outcome.kind === 'failure') throw outcome.failure;
      if (outcome.value.purgedCount > 0)
        logInfo('expired webhook quarantine receipts purged', {
          purgedCount: outcome.value.purgedCount,
        });
    } catch (error: unknown) {
      logWarn(
        'webhook quarantine purge failed',
        redactLogFields({ error }) as LogFields,
      );
    }
  };

  return Object.freeze({
    id: 'webhook_ingestion',
    claim: async () => {
      const outcome = await input.cells.claimEvents.execute({
        workerId: input.workerId,
        leaseMs: input.leaseMs,
        limit: input.batchSize,
      });
      if (outcome.kind === 'failure') throw outcome.failure;

      return Object.freeze(
        outcome.value.map((event) => {
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
          return toWebhookIngestionDurableJobDelivery(event);
        }),
      );
    },
    afterPass: sampleBacklogAndPurgeIfDue,
    complete: async (delivery) => {
      const receipt = receiptFrom(delivery);
      const outcome = await input.cells.completeEvent.execute({
        eventId: receipt.eventId,
        workerId: receipt.workerId,
        attempt: receipt.attempt,
      });
      if (outcome.kind === 'failure') throw outcome.failure;
      if (outcome.value === 'lease_lost') {
        increment('worker.lease_losses', {
          job: 'webhook_ingestion',
          disposition: 'complete',
        });
        logWarn('webhook event completion discarded after lease loss', {
          eventId: receipt.eventId,
          source: receipt.source,
          workerId: receipt.workerId,
          attempt: receipt.attempt,
          disposition: 'complete',
        });
        return leaseLost;
      }
      increment('worker.jobs_completed', {
        job: 'webhook_ingestion',
        source: receipt.source,
      });
      return applied;
    },
    retry: async ({ delivery, availableAt, delayMs, failure }) => {
      const receipt = receiptFrom(delivery);
      const outcome = await input.cells.retryEvent.execute({
        eventId: receipt.eventId,
        workerId: receipt.workerId,
        attempt: receipt.attempt,
        availableAt,
        code: failure.code,
        message: failure.message,
      });
      if (outcome.kind === 'failure') throw outcome.failure;
      if (outcome.value === 'lease_lost') {
        increment('worker.lease_losses', {
          job: 'webhook_ingestion',
          disposition: 'retry',
        });
        logWarn('webhook event retry discarded after lease loss', {
          eventId: receipt.eventId,
          source: receipt.source,
          workerId: receipt.workerId,
          attempt: receipt.attempt,
          disposition: 'retry',
        });
        return leaseLost;
      }
      increment('worker.jobs_retried', {
        job: 'webhook_ingestion',
        source: receipt.source,
      });
      logWarn('webhook event scheduled for retry', {
        eventId: receipt.eventId,
        source: receipt.source,
        code: failure.code,
        attempt: receipt.attempt,
        delayMs,
      });
      return applied;
    },
    deadLetter: async ({ delivery, failure, retention }) => {
      if (retention !== 'retain')
        throw configError({
          code: 'webhook_ingestion_dead_letter_retention_invalid',
          message: 'Webhook ingestion requires retained dead letters.',
        });

      const receipt = receiptFrom(delivery);
      const outcome = await input.cells.deadLetterEvent.execute({
        eventId: receipt.eventId,
        workerId: receipt.workerId,
        attempt: receipt.attempt,
        code: failure.code,
        message: failure.message,
      });
      if (outcome.kind === 'failure') throw outcome.failure;
      if (outcome.value === 'lease_lost') {
        increment('worker.lease_losses', {
          job: 'webhook_ingestion',
          disposition: 'dead',
        });
        logWarn('webhook event failure discarded after lease loss', {
          eventId: receipt.eventId,
          source: receipt.source,
          workerId: receipt.workerId,
          attempt: receipt.attempt,
          disposition: 'dead',
        });
        return leaseLost;
      }

      const error = reportableFailure(failure);
      increment('worker.jobs_failed', {
        job: 'webhook_ingestion',
        source: receipt.source,
        outcome: 'dead',
      });
      increment('worker.dead_letters', {
        job: 'webhook_ingestion',
        source: receipt.source,
        code: failure.code,
      });
      logError('webhook event dead-lettered', {
        eventId: receipt.eventId,
        source: receipt.source,
        code: failure.code,
        attempt: receipt.attempt,
      });
      capture(error, {
        source: 'worker',
        operation: 'webhook_event_dead_letter',
        tags: {
          event_source: receipt.source,
          error_code: failure.code,
          attempt: String(receipt.attempt),
        },
        extra: { eventId: receipt.eventId },
      });
      return applied;
    },
  });
};
