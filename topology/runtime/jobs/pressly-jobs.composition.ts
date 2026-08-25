import { createPostgresRuntime } from '@pressly/postgres/client';
import {
  presslyPostgresOwnerSchemas,
  presslyPostgresSchema,
} from '../../pressly-postgres-schema.js';
import {
  makeProductionActorReadV1Capability,
  makeProductionScopeReconciliationV1Capability,
} from '@pressly/access-system/assembly/production-capabilities';
import { normalizeUnknownError } from '@pressly/errors/app-error';
import type { ExecutableJobCatalog } from '@pressly/cells';
import { observeResultUnitOfWork } from '@pressly/observability';
import { makeOrdersIntegrationSystem } from '@pressly/orders-system';
import {
  applyFulfillmentDemandJobSurface,
  makeProductionSystem,
} from '@pressly/production-system';
import {
  makeIngressSystem,
  processInboundEventJobSurface,
} from '@pressly/ingress-system';
import {
  makeWebhookIngestionDurableQueue,
  observeProcessInboundEventRegistration,
} from '@pressly/ingress-system/capabilities/process-inbound-event-job';
import { makeOrderOutboxDurableQueue } from '@pressly/orders-system/capabilities/order-outbox-job';
import { toOrderOutboxDurableJobDelivery } from '@pressly/production-system/capabilities/apply-fulfillment-demand-job';
import { makeProductionDomainSignals } from '@pressly/production-system/observability/signals';
import type {
  PresslyJobsCompositionInput,
  PresslyJobsProcessAssembly,
} from './types.js';

export type PresslyJobRuntimeOwners = Readonly<{
  'system:ingress': ReturnType<typeof makeIngressSystem>;
  'system:production': ReturnType<typeof makeProductionSystem>;
}>;

export type PresslyJobCatalogFactory = (
  owners: PresslyJobRuntimeOwners,
) => ExecutableJobCatalog;

const workerBacklogMeasurementIntervalMs = 60_000;

export const composePresslyJobs = (
  input: PresslyJobsCompositionInput,
  makeCatalog: PresslyJobCatalogFactory,
): PresslyJobsProcessAssembly => {
  const database = createPostgresRuntime({
    databaseUrl: input.databaseUrl,
    schema: presslyPostgresSchema,
    maxConnections: 5,
  });
  const clock = input.clock;
  const productionSignals = makeProductionDomainSignals(input.counters);
  const productionActorReadV1 = makeProductionActorReadV1Capability(
    database.db,
    presslyPostgresOwnerSchemas.access,
  );
  const productionScopeReconciliationV1 =
    makeProductionScopeReconciliationV1Capability(
      database.db,
      presslyPostgresOwnerSchemas.access,
    );
  const transactionObservation = {
    counters: input.counters,
    measurements: input.measurements,
    trace: input.trace,
    nowNanoseconds: input.nowNanoseconds,
  };
  const productionSystem = makeProductionSystem({
    db: database.db,
    schema: presslyPostgresOwnerSchemas.production,
    ids: input.ids,
    clock,
    productionActorReadV1,
    productionScopeReconciliationV1,
    signals: productionSignals,
    observeCellUnitOfWork: (operation, unitOfWork) =>
      observeResultUnitOfWork({
        ...transactionObservation,
        operation,
        unitOfWork,
      }),
  });
  const ordersSystem = makeOrdersIntegrationSystem({
    db: database.db,
    schema: presslyPostgresOwnerSchemas.orders,
    clock,
  });
  const ingressSystem = makeIngressSystem({
    db: database.db,
    schema: presslyPostgresOwnerSchemas.ingress,
    clock,
    ids: input.ids,
    processInboundEvent: {
      proposeIncomingOrder: ordersSystem.cells.proposeIncomingOrder.execute,
      closeIncomingOrderSource:
        ordersSystem.cells.closeIncomingOrderSource.execute,
      resolveSourceClosedFulfillment:
        productionSystem.cells.resolveSourceClosedFulfillment.execute,
    },
  });
  const webhookIngress = makeWebhookIngestionDurableQueue({
    cells: ingressSystem.cells,
    workerId: input.workerId,
    leaseMs: input.config.leaseMs,
    batchSize: input.config.batchSize,
    backlogMeasurementIntervalMs: workerBacklogMeasurementIntervalMs,
    nowNanoseconds: input.nowNanoseconds,
    logger: input.logger,
    counters: input.counters,
    measurements: input.measurements,
    errors: input.errors,
  });

  const orderOutbox = makeOrderOutboxDurableQueue({
    cells: ordersSystem.cells,
    workerId: input.workerId,
    leaseMs: input.config.leaseMs,
    batchSize: input.config.batchSize,
    backlogMeasurementIntervalMs: workerBacklogMeasurementIntervalMs,
    nowNanoseconds: input.nowNanoseconds,
    logger: input.logger,
    counters: input.counters,
    measurements: input.measurements,
    errors: input.errors,
    toDelivery: toOrderOutboxDurableJobDelivery,
  });
  const catalog = makeCatalog({
    'system:ingress': ingressSystem,
    'system:production': productionSystem,
  });
  const execution = input.mechanisms.makeDurableJobExecution({
    bindings: [
      {
        expected: {
          jobId: processInboundEventJobSurface.id,
          queue: 'webhook_ingestion',
          maxAttempts: 8,
        },
        queue: webhookIngress,
        observeRegistration: (registration) =>
          observeProcessInboundEventRegistration({
            registration,
            clock,
            measurements: input.measurements,
          }),
      },
      {
        expected: {
          jobId: applyFulfillmentDemandJobSurface.id,
          queue: 'order_outbox',
          maxAttempts: 8,
        },
        queue: orderOutbox,
      },
    ],
    runtimeMaxAttempts: input.config.maxAttempts,
    pollIntervalMs: input.config.pollIntervalMs,
    loopRetryBaseMs: input.config.loopRetryBaseMs,
    loopRetryMaxMs: input.config.loopRetryMaxMs,
    deliveryRetryBaseMs: input.config.retryBaseMs,
    deliveryRetryMaxMs: input.config.retryMaxMs,
    heartbeat: input.mechanisms.makeWorkerSentryHeartbeat({
      heartbeat: input.mechanisms.makeFileHeartbeat({
        path: input.config.heartbeatFile,
      }),
      logger: input.logger,
      sentryEnabled: input.sentryEnabled,
    }),
    now: clock.now,
    nowNanoseconds: input.nowNanoseconds,
    random: input.random,
    observer: input.mechanisms.makeWorkerDurableJobObserver(input),
    classifyUnexpected: (failure: unknown) => {
      const error = normalizeUnknownError(failure);
      return Object.freeze({
        code: error.code,
        message: error.safeMessage,
        retryable: input.mechanisms.isRetryableAppError(error),
        reportable: error,
      });
    },
    shutdowns: [database.close],
  });

  return Object.freeze({ catalog, execution });
};
