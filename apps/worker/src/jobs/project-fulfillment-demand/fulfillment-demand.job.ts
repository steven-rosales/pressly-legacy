import { createHash } from 'node:crypto';
import type { FulfillmentDemandChangedEvent } from '@pressly/contracts';
import type { Logger } from '@pressly/logging';
import {
  attemptObservation,
  isolateCounterSink,
  type CounterSink,
  type ErrorReporter,
} from '@pressly/metrics';
import type { OrdersWorkerApplication } from '@pressly/orders';
import type { ProductionApplication } from '@pressly/production';
import {
  invariantViolationError,
  normalizeUnknownError,
  type AppError,
} from '@pressly/errors';
import {
  decideFailureDisposition,
  isRetryableAppError,
} from '../../runtime/failure-disposition.ts';
import { retryDelayMs } from '../../runtime/retry.ts';

const projectionHash = (value: FulfillmentDemandChangedEvent): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        value.fulfillmentId,
        value.displayNumber,
        value.locationId,
        value.typeCode,
        value.admissionState,
        value.commercialState,
        value.dueAt,
        value.estimatedWeightLbs,
        value.estimatedWeightSource,
        value.bagCount,
        value.version,
        value.observedAt,
      ]),
    )
    .digest('hex');

type OrderOutboxPort = Pick<
  OrdersWorkerApplication,
  'claimOutbox' | 'completeOutbox' | 'retryOutbox' | 'deadLetterOutbox'
>;

type ProductionDemandPort = Pick<
  ProductionApplication,
  'applyFulfillmentDemand'
>;

export const makeFulfillmentDemandProjectionJob = (deps: {
  orders: OrderOutboxPort;
  production: ProductionDemandPort;
  clock: Readonly<{ now: () => Date }>;
  random: () => number;
  logger: Logger;
  counters: CounterSink;
  errors: ErrorReporter;
  config: Readonly<{
    workerId: string;
    leaseMs: number;
    batchSize: number;
    maxAttempts: number;
    retryBaseMs: number;
    retryMaxMs: number;
  }>;
}) => {
  const observe = (effect: () => void): void => {
    attemptObservation(effect);
  };
  const { increment } = isolateCounterSink(deps.counters);
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
    if (outcome.tag === 'err') throw outcome.error;
    if (!outcome.value.retried)
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
    if (outcome.tag === 'err') throw outcome.error;
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
    if (outcome.tag === 'err') throw outcome.error;
    if (!outcome.value.completed)
      logWarn('order outbox completion discarded after lease loss', {
        eventId,
        workerId: deps.config.workerId,
      });
    else
      increment('worker.jobs_completed', {
        job: 'order_outbox',
      });
  };

  return {
    runOnce: async (): Promise<number> => {
      const claim = await deps.orders.claimOutbox({
        workerId: deps.config.workerId,
        limit: deps.config.batchSize,
        leaseMs: deps.config.leaseMs,
      });
      if (claim.tag === 'err') throw claim.error;

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
          projected = await deps.production.applyFulfillmentDemand({
            fulfillmentId: demand.fulfillmentId,
            fulfillmentVersion: demand.version,
            projectionHash: projectionHash(demand),
            displayReference: demand.displayNumber,
            locationId: demand.locationId,
            admissionState: demand.admissionState,
            commercialState: demand.commercialState,
            dueAt: demand.dueAt,
            observedAt: demand.observedAt,
            estimatedWeightLbs: demand.estimatedWeightLbs,
            estimatedWeightSource:
              demand.estimatedWeightLbs === null ? null : 'external_estimate',
            bagCount: demand.bagCount,
            idempotencyKey: `order-outbox:${event.id}`,
          });
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
            error: projected.error,
          });
          continue;
        }
        await complete(event.id);
      }
      return claim.value.length;
    },
  };
};

export type FulfillmentDemandProjectionJob = ReturnType<
  typeof makeFulfillmentDemandProjectionJob
>;
