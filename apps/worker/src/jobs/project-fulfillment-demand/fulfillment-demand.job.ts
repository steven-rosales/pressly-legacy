import { redactLogFields, type Logger, type LogFields } from '@pressly/logging';
import {
  attemptObservation,
  isolateCounterSink,
  isolateMeasurementSink,
  type CounterSink,
  type ErrorReporter,
  type MeasurementSink,
} from '@pressly/observability';
import type { OrdersWorkerApplication } from '@pressly/orders';
import {
  productionFailureToAppError,
  type ProductionApplication,
} from '@pressly/production';
import type { Clock } from '@pressly/time';
import {
  normalizeUnknownError,
  type AppError,
} from '@pressly/errors/app-error';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  decideFailureDisposition,
  isRetryableAppError,
} from '../../runtime/failure-disposition.ts';
import { retryDelayMs } from '../../runtime/retry.ts';
import { toApplyFulfillmentDemandCommand } from './fulfillment-demand.projection.mapper.ts';
import { ordersWorkerFailureToAppError } from '../order-failure.error.ts';

type OrderOutboxPort = Pick<
  OrdersWorkerApplication,
  | 'measureOutboxBacklog'
  | 'claimOutbox'
  | 'completeOutbox'
  | 'retryOutbox'
  | 'deadLetterOutbox'
>;

type ProductionDemandPort = Pick<
  ProductionApplication,
  'applyFulfillmentDemand'
>;

export const makeFulfillmentDemandProjectionJob = (deps: {
  orders: OrderOutboxPort;
  production: ProductionDemandPort;
  clock: Clock;
  nowNanoseconds?: () => bigint;
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
  const nowNanoseconds = deps.nowNanoseconds ?? process.hrtime.bigint;
  const backlogMeasurementIntervalNanoseconds =
    BigInt(deps.config.backlogMeasurementIntervalMs) * 1_000_000n;
  let lastBacklogMeasurementAttemptAt: bigint | undefined;
  const observe = (effect: () => void): void => {
    attemptObservation(effect);
  };
  const { increment } = isolateCounterSink(deps.counters);
  const { observe: measure } = isolateMeasurementSink(deps.measurements);
  const capture: ErrorReporter['capture'] = (error, context) =>
    observe(() => deps.errors.capture(error, context));
  const logWarn: Logger['warn'] = (message, fields) =>
    observe(() => deps.logger.warn(message, fields));
  const logError: Logger['error'] = (message, fields) =>
    observe(() => deps.logger.error(message, fields));

  const retry = async (input: {
    eventId: string;
    attempt: number;
    code: string;
    message: string;
  }): Promise<void> => {
    const delayMs = retryDelayMs({
      attempt: input.attempt,
      baseMs: deps.config.retryBaseMs,
      maxMs: deps.config.retryMaxMs,
      jitter: deps.random(),
    });

    const outcome = await deps.orders.retryOutbox({
      eventId: input.eventId,
      workerId: deps.config.workerId,
      availableAt: new Date(deps.clock.now().getTime() + delayMs),
      errorCode: input.code,
      errorMessage: input.message,
    });

    if (!outcome.retried)
      logWarn('order outbox retry discarded after lease loss', {
        eventId: input.eventId,
        workerId: deps.config.workerId,
      });
    else
      increment('worker.jobs_retried', {
        job: 'order_outbox',
        code: input.code,
      });
  };

  const deadLetter = async (input: {
    eventId: string;
    error: AppError;
  }): Promise<void> => {
    const outcome = await deps.orders.deadLetterOutbox({
      eventId: input.eventId,
      workerId: deps.config.workerId,
      errorCode: input.error.code,
      errorMessage: input.error.safeMessage,
    });

    if (outcome.tag === 'err')
      throw ordersWorkerFailureToAppError(outcome.error);
    if (!outcome.value.deadLettered) {
      logWarn('order outbox dead-letter discarded after lease loss', {
        eventId: input.eventId,
        workerId: deps.config.workerId,
      });
      return;
    }

    logError('order outbox event dead-lettered', {
      eventId: input.eventId,
      code: input.error.code,
    });
    increment('worker.dead_letters', {
      job: 'order_outbox',
      code: input.error.code,
    });
    increment('worker.jobs_failed', {
      job: 'order_outbox',
      code: input.error.code,
    });
    capture(input.error, {
      source: 'worker',
      operation: 'order_outbox',
      tags: { code: input.error.code },
      extra: { eventId: input.eventId },
    });
  };

  const fail = async (input: {
    eventId: string;
    attempt: number;
    error: AppError;
  }): Promise<void> => {
    const disposition = decideFailureDisposition({
      retryable: isRetryableAppError(input.error),
      attempt: input.attempt,
      maxAttempts: deps.config.maxAttempts,
    });

    if (disposition.action === 'dead_letter') {
      await deadLetter(input);
      return;
    }

    await retry({
      eventId: input.eventId,
      attempt: input.attempt,
      code: input.error.code,
      message: input.error.safeMessage,
    });
  };

  const complete = async (eventId: string): Promise<void> => {
    const outcome = await deps.orders.completeOutbox({
      eventId,
      workerId: deps.config.workerId,
    });
    if (!outcome.completed)
      logWarn('order outbox completion discarded after lease loss', {
        eventId,
        workerId: deps.config.workerId,
      });
    else
      increment('worker.jobs_completed', {
        job: 'order_outbox',
      });
  };

  const sampleBacklogIfDue = async (): Promise<void> => {
    try {
      const now = nowNanoseconds();
      if (
        lastBacklogMeasurementAttemptAt !== undefined &&
        now - lastBacklogMeasurementAttemptAt <
          backlogMeasurementIntervalNanoseconds
      )
        return;

      // Record the attempt before I/O so a failing aggregate cannot turn the
      // one-second claim loop into a database or warning storm.
      lastBacklogMeasurementAttemptAt = now;
      const backlog = await deps.orders.measureOutboxBacklog();
      measure('worker.outbox_pending_count', backlog.pendingCount, {
        job: 'order_outbox',
      });
      measure(
        'worker.outbox_oldest_pending_age_seconds',
        backlog.oldestPendingAgeSeconds,
        { job: 'order_outbox' },
      );
    } catch (error: unknown) {
      logWarn(
        'order outbox backlog measurement failed',
        redactLogFields({ error }) as LogFields,
      );
    }
  };

  return {
    runOnce: async (): Promise<number> => {
      try {
        const claim = await deps.orders.claimOutbox({
          workerId: deps.config.workerId,
          limit: deps.config.batchSize,
          leaseMs: deps.config.leaseMs,
        });
        if (claim.tag === 'err')
          throw ordersWorkerFailureToAppError(claim.error);

        for (const event of claim.value) {
          if (event.kind === 'invalid') {
            await fail({
              eventId: event.id,
              attempt: event.attempts,
              error: invariantViolationError({
                code: `order_outbox_${event.validationError}`,
                message:
                  'The order outbox event is outside its durable contract.',
                safeMessage:
                  'The order outbox event is outside its durable contract.',
              }),
            });
            continue;
          }
          const demand = event.payload;
          if (demand.typeCode !== 'wash_fold') {
            await complete(event.id);
            continue;
          }

          let projected: Awaited<
            ReturnType<ProductionApplication['applyFulfillmentDemand']>
          >;
          try {
            projected = await deps.production.applyFulfillmentDemand(
              toApplyFulfillmentDemandCommand({
                eventId: event.id,
                demand,
              }),
            );
          } catch (error: unknown) {
            await fail({
              eventId: event.id,
              attempt: event.attempts,
              error: normalizeUnknownError(error),
            });
            continue;
          }
          if (projected.tag === 'err') {
            await fail({
              eventId: event.id,
              attempt: event.attempts,
              error: productionFailureToAppError(projected.error),
            });
            continue;
          }
          await complete(event.id);
        }
        return claim.value.length;
      } finally {
        // Sampling is independently fail-open, so it cannot replace the claim
        // or processing outcome that this pass must report to the worker loop.
        await sampleBacklogIfDue();
      }
    },
  };
};

export type FulfillmentDemandProjectionJob = ReturnType<
  typeof makeFulfillmentDemandProjectionJob
>;
