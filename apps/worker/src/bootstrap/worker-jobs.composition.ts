import { createDatabaseRuntime } from '@pressly/db/client';
import { uuidIdSource } from '@pressly/kernel/node';
import type { Logger } from '@pressly/logging';
import type {
  CounterSink,
  ErrorReporter,
  MeasurementSink,
  TraceSink,
} from '@pressly/observability';
import { makePostgresOrdersWorkerApplication } from '@pressly/orders';
import { makePostgresProductionApplication } from '@pressly/production';
import { makePostgresWebhookIngestionApplication } from '@pressly/webhook-ingestion';
import { systemClock } from '@pressly/time';
import { makeIgnoredCentsEventHandler } from '../jobs/process-webhook-inbox/cents/cents-ignored.handler.js';
import { makeCentsOrderHandler } from '../jobs/process-webhook-inbox/cents/cents-order.handler.js';
import { makeWebhookEventDispatcher } from '../jobs/process-webhook-inbox/webhook-event.dispatcher.js';
import { makeWebhookInboxJob } from '../jobs/process-webhook-inbox/webhook-inbox.job.js';
import { makeFulfillmentDemandProjectionJob } from '../jobs/project-fulfillment-demand/fulfillment-demand.job.js';
import type { WorkerConfig } from '../runtime/env.js';
import {
  makeSequentialJob,
  observeWorkerJob,
  type WorkerJob,
} from '../runtime/job.js';
import { makeProductionDomainSignals } from './production-signals.adapter.js';

export type WorkerJobs = Readonly<{
  job: WorkerJob;
  close: () => Promise<void>;
}>;

const workerBacklogMeasurementIntervalMs = 60_000;

export const composeWorkerJobs = (input: {
  databaseUrl: string;
  workerId: string;
  config: WorkerConfig['jobs'];
  logger: Logger;
  counters: CounterSink;
  measurements: MeasurementSink;
  errors: ErrorReporter;
  trace: TraceSink;
}): WorkerJobs => {
  const database = createDatabaseRuntime({
    databaseUrl: input.databaseUrl,
    maxConnections: 5,
  });
  const clock = systemClock;
  const production = makePostgresProductionApplication({
    db: database.db,
    clock,
    ids: uuidIdSource,
    signals: makeProductionDomainSignals(input.counters),
    transactions: {
      counters: input.counters,
      measurements: input.measurements,
      trace: input.trace,
      nowNanoseconds: process.hrtime.bigint,
    },
  });
  const ingestion = makePostgresWebhookIngestionApplication({
    db: database.db,
    clock,
    ids: uuidIdSource,
  });
  const orders = makePostgresOrdersWorkerApplication({
    db: database.db,
    clock,
    transactions: {
      counters: input.counters,
      measurements: input.measurements,
      trace: input.trace,
      nowNanoseconds: process.hrtime.bigint,
    },
  });
  const acknowledgeIgnoredCentsEvent = makeIgnoredCentsEventHandler();

  const webhookInbox = makeWebhookInboxJob({
    ingestion,
    consume: makeWebhookEventDispatcher({
      'cents:order': makeCentsOrderHandler({
        resolveSourceLocation: ingestion.resolveSourceLocation,
        orders: {
          proposeIncomingOrder: orders.proposeIncomingOrder,
          closeIncomingOrderSource: orders.closeIncomingOrderSource,
        },
        production: {
          resolveSourceClosedFulfillment:
            production.resolveSourceClosedFulfillment,
        },
      }),
      'cents:customer': acknowledgeIgnoredCentsEvent,
      'cents:marketing': acknowledgeIgnoredCentsEvent,
    }),
    clock,
    nowNanoseconds: process.hrtime.bigint,
    random: Math.random,
    logger: input.logger,
    counters: input.counters,
    measurements: input.measurements,
    errors: input.errors,
    config: {
      workerId: input.workerId,
      leaseMs: input.config.leaseMs,
      batchSize: input.config.batchSize,
      maxAttempts: input.config.maxAttempts,
      retryBaseMs: input.config.retryBaseMs,
      retryMaxMs: input.config.retryMaxMs,
      backlogMeasurementIntervalMs: workerBacklogMeasurementIntervalMs,
    },
  });

  const fulfillmentDemandProjection = makeFulfillmentDemandProjectionJob({
    orders,
    production,
    clock,
    nowNanoseconds: process.hrtime.bigint,
    random: Math.random,
    logger: input.logger,
    counters: input.counters,
    measurements: input.measurements,
    errors: input.errors,
    config: {
      workerId: input.workerId,
      leaseMs: input.config.leaseMs,
      batchSize: input.config.batchSize,
      maxAttempts: input.config.maxAttempts,
      retryBaseMs: input.config.retryBaseMs,
      retryMaxMs: input.config.retryMaxMs,
      backlogMeasurementIntervalMs: workerBacklogMeasurementIntervalMs,
    },
  });

  return {
    job: makeSequentialJob([
      observeWorkerJob({
        name: 'webhook_ingestion',
        job: webhookInbox,
        counters: input.counters,
        measurements: input.measurements,
        trace: input.trace,
      }),
      observeWorkerJob({
        name: 'order_outbox',
        job: fulfillmentDemandProjection,
        counters: input.counters,
        measurements: input.measurements,
        trace: input.trace,
      }),
    ]),
    close: database.close,
  };
};
