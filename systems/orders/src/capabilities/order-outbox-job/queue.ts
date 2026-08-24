import { redactLogFields, type Logger, type LogFields } from '@pressly/logging';
import { isAppError, type AppError } from '@pressly/errors/app-error';
import {
  configError,
  conflictError,
  externalServiceError,
  invariantViolationError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import type {
  ClaimedDurableJobDelivery,
  DurableJobFailure,
  DurableJobQueue,
  DurableJobTransitionOutcome,
} from '@pressly/jobs';
import type { OrdersSystem } from '../../system.ts';
import {
  attemptObservation,
  isolateCounterSink,
  isolateMeasurementSink,
  type CounterSink,
  type ErrorReporter,
  type MeasurementSink,
} from '@pressly/observability';
import { ordersWorkerFailureToAppError } from './failure.ts';
import type {
  OrderOutboxDeliveryReceipt,
  ToOrderOutboxDurableJobDelivery,
} from './contract.ts';

type OrderOutboxCells = Pick<
  OrdersSystem['cells'],
  | 'claimOrderOutbox'
  | 'completeOrderOutbox'
  | 'deadLetterOrderOutbox'
  | 'measureOrderOutboxBacklog'
  | 'retryOrderOutbox'
>;

type ReportableDurableJobFailure = DurableJobFailure &
  Readonly<{ reportable?: AppError }>;

const applied: DurableJobTransitionOutcome = Object.freeze({
  kind: 'applied',
});
const leaseLost: DurableJobTransitionOutcome = Object.freeze({
  kind: 'lease-lost',
});

const receiptFrom = (
  delivery: ClaimedDurableJobDelivery,
): OrderOutboxDeliveryReceipt => {
  const receipt = delivery.receipt;
  if (
    typeof receipt === 'object' &&
    receipt !== null &&
    'eventId' in receipt &&
    typeof receipt.eventId === 'string' &&
    'workerId' in receipt &&
    typeof receipt.workerId === 'string'
  )
    return { eventId: receipt.eventId, workerId: receipt.workerId };

  throw invariantViolationError({
    code: 'order_outbox_delivery_receipt_invalid',
    message: 'The claimed Order outbox delivery receipt is invalid.',
    safeMessage: 'Order outbox delivery data is inconsistent.',
  });
};

const reportableFailure = (failure: DurableJobFailure): AppError => {
  const reportable = Reflect.get(failure, 'reportable');
  if (isAppError(reportable)) return reportable;

  const input = {
    code: failure.code,
    message: failure.message,
    safeMessage: failure.message,
  };
  switch (failure.category) {
    case 'validation':
      return validationError({
        ...input,
        status: failure.status === 422 ? 422 : 400,
      });
    case 'conflict':
      return conflictError(input);
    case 'not_found':
      return notFoundError(input);
    case 'external_service':
      return externalServiceError({
        ...input,
        status:
          failure.status === 502 ||
          failure.status === 503 ||
          failure.status === 504
            ? failure.status
            : 503,
      });
    case 'invariant':
      return invariantViolationError(input);
    case undefined:
      return invariantViolationError(input);
  }

  return invariantViolationError(input);
};

const claimFailure = (
  outcome: Awaited<ReturnType<OrderOutboxCells['claimOrderOutbox']['execute']>>,
) => {
  if (outcome.kind === 'success') return outcome.value;
  throw ordersWorkerFailureToAppError(outcome.failure);
};

const deadLetterFailure = (
  outcome: Awaited<
    ReturnType<OrderOutboxCells['deadLetterOrderOutbox']['execute']>
  >,
) => {
  if (outcome.kind === 'success') return outcome.value;
  throw ordersWorkerFailureToAppError(outcome.failure);
};

export const makeOrderOutboxDurableQueue = (input: {
  cells: OrderOutboxCells;
  workerId: string;
  leaseMs: number;
  batchSize: number;
  backlogMeasurementIntervalMs: number;
  nowNanoseconds?: () => bigint;
  logger: Logger;
  counters: CounterSink;
  measurements: MeasurementSink;
  errors: ErrorReporter;
  toDelivery: ToOrderOutboxDurableJobDelivery;
}): DurableJobQueue => {
  const nowNanoseconds = input.nowNanoseconds ?? process.hrtime.bigint;
  const backlogMeasurementIntervalNanoseconds =
    BigInt(input.backlogMeasurementIntervalMs) * 1_000_000n;
  let lastBacklogMeasurementAttemptAt: bigint | undefined;
  const { increment } = isolateCounterSink(input.counters);
  const { observe: measure } = isolateMeasurementSink(input.measurements);
  const logWarn: Logger['warn'] = (message, fields) =>
    attemptObservation(() => input.logger.warn(message, fields));
  const logError: Logger['error'] = (message, fields) =>
    attemptObservation(() => input.logger.error(message, fields));
  const capture: ErrorReporter['capture'] = (error, context) =>
    attemptObservation(() => input.errors.capture(error, context));

  const sampleBacklogIfDue = async (): Promise<void> => {
    try {
      const now = nowNanoseconds();
      if (
        lastBacklogMeasurementAttemptAt !== undefined &&
        now - lastBacklogMeasurementAttemptAt <
          backlogMeasurementIntervalNanoseconds
      )
        return;

      lastBacklogMeasurementAttemptAt = now;
      const outcome = await input.cells.measureOrderOutboxBacklog.execute({});
      if (outcome.kind === 'failure') throw outcome.failure;
      measure('worker.outbox_pending_count', outcome.value.pendingCount, {
        job: 'order_outbox',
      });
      measure(
        'worker.outbox_oldest_pending_age_seconds',
        outcome.value.oldestPendingAgeSeconds,
        { job: 'order_outbox' },
      );
    } catch (error: unknown) {
      logWarn(
        'order outbox backlog measurement failed',
        redactLogFields({ error }) as LogFields,
      );
    }
  };

  return Object.freeze({
    id: 'order_outbox',
    claim: async () => {
      const outcome = await input.cells.claimOrderOutbox.execute({
        workerId: input.workerId,
        limit: input.batchSize,
        leaseMs: input.leaseMs,
      });
      return Object.freeze(claimFailure(outcome).map(input.toDelivery));
    },
    afterPass: sampleBacklogIfDue,
    complete: async (delivery) => {
      const receipt = receiptFrom(delivery);
      const outcome = await input.cells.completeOrderOutbox.execute({
        eventId: receipt.eventId,
        workerId: receipt.workerId,
      });
      if (outcome.kind === 'failure') return outcome.failure;
      if (!outcome.value.completed) {
        logWarn('order outbox completion discarded after lease loss', receipt);
        return leaseLost;
      }
      increment('worker.jobs_completed', { job: 'order_outbox' });
      return applied;
    },
    retry: async ({ delivery, availableAt, failure }) => {
      const receipt = receiptFrom(delivery);
      const outcome = await input.cells.retryOrderOutbox.execute({
        eventId: receipt.eventId,
        workerId: receipt.workerId,
        availableAt,
        errorCode: failure.code,
        errorMessage: failure.message,
      });
      if (outcome.kind === 'failure') return outcome.failure;
      if (!outcome.value.retried) {
        logWarn('order outbox retry discarded after lease loss', receipt);
        return leaseLost;
      }
      increment('worker.jobs_retried', {
        job: 'order_outbox',
        code: failure.code,
      });
      return applied;
    },
    deadLetter: async ({ delivery, failure, retention }) => {
      if (retention !== 'retain')
        throw configError({
          code: 'order_outbox_dead_letter_retention_invalid',
          message: 'The Order outbox requires retained dead letters.',
        });
      const receipt = receiptFrom(delivery);
      const outcome = deadLetterFailure(
        await input.cells.deadLetterOrderOutbox.execute({
          eventId: receipt.eventId,
          workerId: receipt.workerId,
          errorCode: failure.code,
          errorMessage: failure.message,
        }),
      );
      if (!outcome.deadLettered) {
        logWarn('order outbox dead-letter discarded after lease loss', receipt);
        return leaseLost;
      }

      const error = reportableFailure(failure as ReportableDurableJobFailure);
      logError('order outbox event dead-lettered', {
        eventId: receipt.eventId,
        code: failure.code,
      });
      increment('worker.dead_letters', {
        job: 'order_outbox',
        code: failure.code,
      });
      increment('worker.jobs_failed', {
        job: 'order_outbox',
        code: failure.code,
      });
      capture(error, {
        source: 'worker',
        operation: 'order_outbox',
        tags: { code: failure.code },
        extra: { eventId: receipt.eventId },
      });
      return applied;
    },
  });
};
