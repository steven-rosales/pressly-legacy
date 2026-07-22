import { createHash } from 'node:crypto';
import type { FulfillmentDemandChangedEvent } from '@pressly/contracts';
import type { Logger } from '@pressly/logging';
import type { CounterSink, ErrorReporter } from '@pressly/metrics';
import type { OrdersApplication } from '@pressly/orders';
import type { ProductionApplication } from '@pressly/production';
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
  OrdersApplication,
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
      deps.logger.warn('order outbox retry discarded after lease loss', {
        eventId: input.eventId,
        workerId: deps.config.workerId,
      });
    else
      deps.counters.increment('worker.jobs_retried', {
        job: 'order_outbox',
        code: input.code,
      });
  };

  const deadLetter = async (input: {
    eventId: string;
    code: string;
    message: string;
  }): Promise<void> => {
    const outcome = await deps.orders.deadLetterOutbox({
      eventId: input.eventId,
      workerId: deps.config.workerId,
      errorCode: input.code,
      errorMessage: input.message,
    });
    if (outcome.tag === 'err') throw outcome.error;
    if (!outcome.value.deadLettered) {
      deps.logger.warn('order outbox dead-letter discarded after lease loss', {
        eventId: input.eventId,
        workerId: deps.config.workerId,
      });
      return;
    }
    const error = new Error(input.message);
    error.name = input.code;
    deps.logger.error('order outbox event dead-lettered', {
      eventId: input.eventId,
      code: input.code,
    });
    deps.counters.increment('worker.dead_letters', {
      job: 'order_outbox',
      code: input.code,
    });
    deps.counters.increment('worker.jobs_failed', {
      job: 'order_outbox',
      code: input.code,
    });
    deps.errors.capture(error, {
      source: 'worker',
      operation: 'order_outbox',
      tags: { code: input.code },
      extra: { eventId: input.eventId },
    });
  };

  const fail = async (input: {
    eventId: string;
    attempt: number;
    code: string;
    message: string;
    retryable: boolean;
  }): Promise<void> => {
    if (!input.retryable || input.attempt >= deps.config.maxAttempts) {
      await deadLetter(input);
      return;
    }
    await retry(input);
  };

  const complete = async (eventId: string): Promise<void> => {
    const outcome = await deps.orders.completeOutbox({
      eventId,
      workerId: deps.config.workerId,
    });
    if (outcome.tag === 'err') throw outcome.error;
    if (!outcome.value.completed)
      deps.logger.warn('order outbox completion discarded after lease loss', {
        eventId,
        workerId: deps.config.workerId,
      });
    else
      deps.counters.increment('worker.jobs_completed', {
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
            code: `order_outbox_${event.validationError}`,
            message: 'The order outbox event is outside its durable contract.',
            retryable: false,
          });
          continue;
        }
        const demand = event.payload;
        if (demand.typeCode !== 'wash_fold') {
          await complete(event.id);
          continue;
        }

        const projected = await deps.production.applyFulfillmentDemand({
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
        if (projected.tag === 'err') {
          await fail({
            eventId: event.id,
            attempt: event.attempts,
            code: projected.error.code,
            message: projected.error.safeMessage,
            retryable:
              projected.error.status === 429 || projected.error.status >= 500,
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
