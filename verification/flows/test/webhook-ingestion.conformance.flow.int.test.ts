import {
  makeProductionActorReadV1Capability,
  makeProductionScopeReconciliationV1Capability,
} from '@pressly/access-system/assembly/production-capabilities';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc, sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import { normalizeUnknownError } from '@pressly/errors/app-error';
import { makeJobCatalogFromOwners } from '@pressly/generated/job-catalog';
import { makeIngressSystem } from '@pressly/ingress-system/testing/assembly';
import {
  makeWebhookIngestionDurableQueue,
  observeProcessInboundEventRegistration,
} from '@pressly/ingress-system/capabilities/process-inbound-event-job';
import {
  makeDurableQueueJob,
  makeSequentialDurableJob,
  type DurableJobQueue,
} from '@pressly/jobs';
import { registrationsFromJobCatalog } from '@pressly/jobs-host';
import { isRetryableAppError } from '@pressly/jobs-host/runtime-support';
import { nullLogger } from '@pressly/logging';
import type {
  CounterSink,
  ErrorReporter,
  MeasurementSink,
} from '@pressly/observability';
import { makeOrdersIntegrationSystem } from '@pressly/orders-system/testing/assembly';
import { makeOrderOutboxDurableQueue } from '@pressly/orders-system/capabilities/order-outbox-job';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import { toOrderOutboxDurableJobDelivery } from '@pressly/production-system/capabilities/apply-fulfillment-demand-job';
import {
  createTestDatabaseRuntime,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedProductionLocationFixture } from './production-location-fixture.postgres.ts';

// Before S5, these scenarios also ran through the displaced Worker path in an
// isolated database. The old oracle was removed with the atomic catalog
// cutover; these scenarios are now permanent target conformance.

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const adminDatabaseUrl =
  process.env['PRESSLY_WEBHOOK_FLOW_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';

const run = (executable: string, args: readonly string[], env = process.env) =>
  execFileSync(executable, [...args], {
    cwd: repositoryRoot,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180_000,
  });

const databaseUrl = (name: string): string => {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${name}`;
  url.search = '';
  return url.toString();
};

const dropDatabase = (name: string): void => {
  run('dropdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--if-exists',
    '--force',
    name,
  ]);
};

const createDatabase = (name: string): void => {
  run('createdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--template',
    'template0',
    name,
  ]);
  run('pnpm', ['db:migrate'], {
    ...process.env,
    DATABASE_URL: databaseUrl(name),
    NODE_ENV: 'test',
  });
};

const databaseExists = (name: string): boolean =>
  run('psql', [
    adminDatabaseUrl,
    '-Atqc',
    `select datname from pg_database where datname = '${name}'`,
  ]).trim() === name;

const tableNames = [
  'work_events',
  'production_order_stage_attempts',
  'stage_machine_assignments',
  'stage_runs',
  'production_batch_orders',
  'production_batches',
  'production_runs',
  'schedule_runs',
  'production_shift_selected_orders',
  'production_shift_selections',
  'scheduler_configs',
  'production_machines',
  'production_stations',
  'production_bags',
  'production_orders',
  'production_shifts',
  'order_demands',
  'order_outbox_events',
  'order_source_snapshots',
  'order_source_customer_refs',
  'order_source_proposal_transitions',
  'order_source_proposal_resolutions',
  'order_source_terminal_tombstones',
  'order_source_links',
  'order_source_proposals',
  'order_items',
  'order_fulfillments',
  'order_command_receipts',
  'orders',
  'webhook_receipt_quarantine',
  'webhook_events',
  'source_location_bindings',
  'production_locations',
  'business_accounts',
] as const;

type FlowDatabase = TestDatabaseRuntime &
  Readonly<{ name: string; url: string }>;

const makeFlowDatabase = (): FlowDatabase => {
  const suffix = `${process.pid}_${Date.now().toString(36)}`;
  const name = `pressly_webhook_flow_target_test_${suffix}`;
  const url = databaseUrl(name);
  return Object.freeze({
    name,
    url,
    ...createTestDatabaseRuntime({
      databaseUrl: url,
      tableNames,
      maxConnections: 12,
    }),
  });
};

const flowDatabase = makeFlowDatabase();

const uuid = (suffix: number): string =>
  `85000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const ids = Object.freeze({
  business: uuid(1),
  canonicalOrder: uuid(2),
  fulfillment: uuid(3),
  demand: uuid(4),
  productionOrder: uuid(5),
  resolutionEvent: uuid(6),
  preexistingResolutionEvent: uuid(7),
  quarantine: uuid(8),
  ingressGenerated: [uuid(101), uuid(102), uuid(103)],
  productionGenerated: [uuid(201), uuid(202), uuid(203), uuid(204)],
});
const locationId = 'webhook-flow-location';
const externalStoreId = 'cents-store-1';
const initialNow = new Date('2026-08-22T16:00:00.000Z');
const sourceOccurredAt = new Date('2026-08-22T15:58:00.000Z');
const receivedAt = new Date('2026-08-22T15:59:00.000Z');
const dueAt = new Date('2026-08-23T20:00:00.000Z');
const leaseMs = 30_000;
const retryBaseMs = 1_000;
const retryMaxMs = 300_000;

type MutableClock = Readonly<{
  now: () => Date;
  set: (value: Date) => void;
  reads: readonly string[];
}>;

const makeClock = (): MutableClock => {
  let value = new Date(initialNow);
  const reads: string[] = [];
  return Object.freeze({
    now: () => {
      reads.push(value.toISOString());
      return new Date(value);
    },
    set: (next) => {
      value = new Date(next);
    },
    reads,
  });
};

type RecordingIdSource = Readonly<{
  next: () => string;
  generated: readonly string[];
}>;

const makeRecordingIdSource = (
  values: readonly string[],
): RecordingIdSource => {
  let index = 0;
  const generated: string[] = [];
  return Object.freeze({
    next: () => {
      const value = values[index++];
      if (value === undefined)
        throw new Error(
          'The webhook flow fixture exhausted deterministic IDs.',
        );
      generated.push(value);
      return value;
    },
    generated,
  });
};

type CounterObservation = Readonly<{
  name: string;
  labels: Readonly<Record<string, string>> | null;
}>;
type MeasurementObservation = Readonly<{
  name: string;
  value: number;
  labels: Readonly<Record<string, string>> | null;
}>;
type ErrorObservation = Readonly<{
  code: string;
  context: unknown;
}>;
type Instrumentation = Readonly<{
  counterValues: CounterObservation[];
  measurementValues: MeasurementObservation[];
  errorValues: ErrorObservation[];
  counters: CounterSink;
  measurements: MeasurementSink;
  errors: ErrorReporter;
}>;

const makeInstrumentation = (): Instrumentation => {
  const counterValues: CounterObservation[] = [];
  const measurementValues: MeasurementObservation[] = [];
  const errorValues: ErrorObservation[] = [];
  return Object.freeze({
    counterValues,
    measurementValues,
    errorValues,
    counters: {
      increment: (name, labels) =>
        counterValues.push({ name, labels: labels ?? null }),
    },
    measurements: {
      observe: (name, value, labels) =>
        measurementValues.push({ name, value, labels: labels ?? null }),
    },
    errors: {
      capture: (error, context) =>
        errorValues.push({
          code: normalizeUnknownError(error).code,
          context,
        }),
      shutdown: async () => undefined,
    },
  });
};

const submittedPayload = (externalOrderId: string) => ({
  externalOrderId,
  orderCode: `P-${externalOrderId}`,
  externalStoreId,
  status: 'SUBMITTED' as const,
  dueAt: dueAt.toISOString(),
  sourceUpdatedAt: sourceOccurredAt.toISOString(),
  bagCount: null,
  totalAmountCents: 3_600,
  balanceDueCents: 3_600,
  services: [
    {
      externalServiceId: 'wash-fold',
      name: 'Wash and fold',
      category: 'LAUNDRY',
      quantity: 1,
      totalPriceCents: 3_600,
      unitPriceCents: 200,
    },
  ],
  customer: {
    externalUserId: `customer-${externalOrderId}`,
    firstName: 'Flow',
    lastName: 'Fixture',
    phone: '+15550000000',
    businessName: null,
    email: null,
  },
});

const terminalPayload = (
  externalOrderId: string,
  status: 'COMPLETED' | 'CANCELED' = 'COMPLETED',
) => ({
  externalOrderId,
  externalStoreId,
  status,
  sourceUpdatedAt: sourceOccurredAt.toISOString(),
});

type EventInput = Readonly<{
  id: string;
  externalOrderId?: string;
  source?: string;
  subjectType?: string;
  subjectId?: string | null;
  sourceLocationId?: string | null;
  sourceOccurredAt?: Date | null;
  receivedAt?: Date;
  availableAt?: Date;
  payload?: unknown;
  payloadHash?: string | null;
  status?: 'pending' | 'processing' | 'processed' | 'dead';
  attempts?: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
}>;

const seedEvent = async (
  db: PostgresDatabase,
  input: EventInput,
): Promise<void> => {
  const externalOrderId = input.externalOrderId ?? `order-${input.id}`;
  await db.insert(presslyPostgresOwnerSchemas.ingress.webhookEvents).values({
    id: input.id,
    source: input.source ?? 'cents',
    eventType: 'order_updated',
    dedupeKey: `flow-${input.id}`,
    subjectType: input.subjectType ?? 'order',
    subjectId:
      input.subjectId === undefined ? externalOrderId : input.subjectId,
    sourceLocationId:
      input.sourceLocationId === undefined
        ? externalStoreId
        : input.sourceLocationId,
    sourceOccurredAt:
      input.sourceOccurredAt === undefined
        ? sourceOccurredAt
        : input.sourceOccurredAt,
    payload:
      input.payload === undefined
        ? submittedPayload(externalOrderId)
        : input.payload,
    payloadHash:
      input.payloadHash === undefined ? 'a'.repeat(64) : input.payloadHash,
    rawBodySha256: 'b'.repeat(64),
    status: input.status ?? 'pending',
    attempts: input.attempts ?? 0,
    availableAt: input.availableAt ?? receivedAt,
    leaseOwner: input.leaseOwner ?? null,
    leaseExpiresAt: input.leaseExpiresAt ?? null,
    receivedAt: input.receivedAt ?? receivedAt,
  });
};

const seedAccessScope = async (db: PostgresDatabase): Promise<void> => {
  await db.insert(presslyPostgresOwnerSchemas.access.businessAccounts).values({
    id: ids.business,
    slug: 'webhook-flow',
    displayName: 'Webhook Flow',
    createdAt: initialNow,
    updatedAt: initialNow,
  });
  await db
    .insert(presslyPostgresOwnerSchemas.access.accessProductionLocations)
    .values({
      id: locationId,
      businessId: ids.business,
      name: 'Webhook Flow Facility',
      timezone: 'America/New_York',
      createdAt: initialNow,
      updatedAt: initialNow,
    });
};

const seedProductionLocation = async (db: PostgresDatabase): Promise<void> => {
  await seedProductionLocationFixture(db, {
    id: locationId,
    businessId: ids.business,
    name: 'Webhook Flow Facility',
    timezone: 'America/New_York',
    createdAt: initialNow,
    updatedAt: initialNow,
  });
};

const seedIngressBinding = async (db: PostgresDatabase): Promise<void> => {
  await db
    .insert(presslyPostgresOwnerSchemas.ingress.sourceLocationBindings)
    .values({
      source: 'cents',
      externalLocationId: externalStoreId,
      locationId,
      isActive: true,
      createdAt: initialNow,
      updatedAt: initialNow,
    });
};

const seedCanonicalOrder = async (
  db: PostgresDatabase,
  externalOrderId: string,
  releaseState: 'unreleased' | 'released' = 'unreleased',
): Promise<void> => {
  await db.insert(presslyPostgresOwnerSchemas.orders.orders).values({
    id: ids.canonicalOrder,
    businessId: ids.business,
    customerResolution: 'not_provided',
    displayNumber: `P-${externalOrderId}`,
    state: 'open',
    dueAt,
    currency: 'USD',
    totalAmountCents: 3_600,
    balanceDueCents: 3_600,
    version: 1,
    createdAt: initialNow,
    updatedAt: initialNow,
  });
  await db.insert(presslyPostgresOwnerSchemas.orders.orderFulfillments).values({
    id: ids.fulfillment,
    businessId: ids.business,
    orderId: ids.canonicalOrder,
    typeCode: 'wash_fold',
    locationId,
    releaseState,
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'source_estimate',
    version: 1,
    createdAt: initialNow,
    updatedAt: initialNow,
  });
  await db.insert(presslyPostgresOwnerSchemas.orders.orderSourceLinks).values({
    source: 'cents',
    externalOrderId,
    orderId: ids.canonicalOrder,
    createdAt: initialNow,
    updatedAt: initialNow,
  });
};

const seedProductionProjection = async (
  db: PostgresDatabase,
  input: Readonly<{
    admissionState?: 'unreleased' | 'released';
    resolutionState?: 'open' | 'resolved_without_production';
  }> = {},
): Promise<void> => {
  const admissionState = input.admissionState ?? 'unreleased';
  const resolutionState = input.resolutionState ?? 'open';
  await db.insert(presslyPostgresOwnerSchemas.production.orderDemands).values({
    id: ids.demand,
    fulfillmentId: ids.fulfillment,
    fulfillmentVersion: 1,
    projectionHash: 'c'.repeat(64),
    admissionState,
    commercialState: 'open',
    displayReference: 'WEBHOOK-FLOW',
    locationId,
    revisionAt: initialNow,
    phase: 'expected',
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'external_estimate',
    dueAt,
    createdAt: initialNow,
    updatedAt: initialNow,
  });
  await db
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values({
      id: ids.productionOrder,
      orderDemandId: ids.demand,
      locationId,
      dueAt,
      operationalStatus: 'release_pending',
      executionStatus: 'unassigned',
      resolutionState,
      ...(resolutionState === 'resolved_without_production'
        ? {
            resolvedAt: initialNow,
            resolvedBy: '00000000-0000-4000-8000-000000000000',
            resolutionReason: 'order_will_not_be_produced',
          }
        : {}),
      derivedWeightLbs: 18,
      derivedWeightSource: 'external_estimate',
      intakeVersion: 0,
      version: resolutionState === 'open' ? 4 : 5,
      createdAt: initialNow,
      updatedAt: initialNow,
    });
};

const seedExpiredReceipt = async (db: PostgresDatabase): Promise<void> => {
  await db
    .insert(presslyPostgresOwnerSchemas.ingress.webhookReceiptQuarantine)
    .values({
      id: ids.quarantine,
      source: 'cents',
      rawBodySha256: 'e'.repeat(64),
      adapterVersion: 'cents-webhook-v3',
      eventType: 'order_updated',
      normalizationOutcome: 'accepted',
      payloadCiphertext: 'v1.expired.fixture',
      receivedAt: new Date(initialNow.getTime() - 120_000),
      expiresAt: new Date(initialNow.getTime() - 1),
    });
};

const removeFaults = async (db: PostgresDatabase): Promise<void> => {
  await db.execute(
    sql`drop trigger if exists webhook_flow_proposal_fault on order_source_proposals`,
  );
  await db.execute(
    sql`drop function if exists webhook_flow_reject_proposal_insert()`,
  );
  await db.execute(
    sql`drop trigger if exists webhook_flow_transition_fault on order_source_proposal_transitions`,
  );
  await db.execute(
    sql`drop function if exists webhook_flow_reject_transition_insert()`,
  );
};

const installProposalFault = async (db: PostgresDatabase): Promise<void> => {
  await db.execute(sql`
    create function webhook_flow_reject_proposal_insert()
    returns trigger language plpgsql as $$
    begin
      raise exception 'injected webhook proposal failure';
    end;
    $$
  `);
  await db.execute(sql`
    create trigger webhook_flow_proposal_fault
    before insert on order_source_proposals
    for each row execute function webhook_flow_reject_proposal_insert()
  `);
};

const installTransitionFault = async (db: PostgresDatabase): Promise<void> => {
  await db.execute(sql`
    create function webhook_flow_reject_transition_insert()
    returns trigger language plpgsql as $$
    begin
      raise exception 'injected webhook transition failure';
    end;
    $$
  `);
  await db.execute(sql`
    create trigger webhook_flow_transition_fault
    before insert on order_source_proposal_transitions
    for each row execute function webhook_flow_reject_transition_insert()
  `);
};

type TransitionInterception =
  | 'crash-after-complete-effect'
  | 'lose-complete-lease'
  | 'lose-retry-lease'
  | 'lose-dead-lease';

type FlowFixture = Readonly<{
  database: FlowDatabase;
  clock: MutableClock;
  ingressIds: RecordingIdSource;
  productionIds: RecordingIdSource;
  instrumentation: Instrumentation;
  makeRunner: (
    input?: Readonly<{
      workerId?: string;
      batchSize?: number;
      transition?: TransitionInterception;
    }>,
  ) => Readonly<{
    runOnce: () => Promise<number>;
    webhookRegistrationCount: number;
    totalBusinessHandlerCount: number;
  }>;
}>;

const classifyUnexpected = (failure: unknown) => {
  const error = normalizeUnknownError(failure);
  return Object.freeze({
    code: error.code,
    message: error.safeMessage,
    retryable: isRetryableAppError(error),
    reportable: error,
  });
};

const stealLease = async (
  db: PostgresDatabase,
  deliveryId: string,
): Promise<void> => {
  await db.execute(sql`
    update webhook_events
    set lease_owner = 'winning-worker', attempts = attempts + 1
    where id = ${deliveryId}::uuid and status = 'processing'
  `);
};

const interceptTargetQueue = (
  db: PostgresDatabase,
  queue: DurableJobQueue,
  transition: TransitionInterception | undefined,
): DurableJobQueue => ({
  ...queue,
  complete: async (delivery) => {
    if (transition === 'crash-after-complete-effect')
      throw new Error('crash after Orders proposal before acknowledgement');
    if (transition === 'lose-complete-lease') await stealLease(db, delivery.id);
    return queue.complete(delivery);
  },
  retry: async (input) => {
    if (transition === 'lose-retry-lease')
      await stealLease(db, input.delivery.id);
    return queue.retry(input);
  },
  deadLetter: async (input) => {
    if (transition === 'lose-dead-lease')
      await stealLease(db, input.delivery.id);
    return queue.deadLetter(input);
  },
});

const makeFixture = (database: FlowDatabase): FlowFixture => {
  const clock = makeClock();
  const ingressIds = makeRecordingIdSource(ids.ingressGenerated);
  const productionIds = makeRecordingIdSource(ids.productionGenerated);
  const instrumentation = makeInstrumentation();

  const makeRunner: FlowFixture['makeRunner'] = (input = {}) => {
    const workerId = input.workerId ?? 'webhook-flow-worker';
    const batchSize = input.batchSize ?? 20;
    const ordersSystem = makeOrdersIntegrationSystem({
      schema: presslyPostgresOwnerSchemas.orders,
      db: database.db,
      clock,
    });
    const productionSystem = makeProductionSystem({
      schema: presslyPostgresOwnerSchemas.production,
      productionActorReadV1: makeProductionActorReadV1Capability(
        database.db,
        presslyPostgresOwnerSchemas.access,
      ),
      productionScopeReconciliationV1:
        makeProductionScopeReconciliationV1Capability(
          database.db,
          presslyPostgresOwnerSchemas.access,
        ),
      db: database.db,
      clock,
      ids: productionIds,
    });
    const ingressSystem = makeIngressSystem({
      schema: presslyPostgresOwnerSchemas.ingress,
      db: database.db,
      clock,
      ids: ingressIds,
      processInboundEvent: {
        proposeIncomingOrder: (command) =>
          ordersSystem.cells.proposeIncomingOrder.execute(command),
        closeIncomingOrderSource: (command) =>
          ordersSystem.cells.closeIncomingOrderSource.execute(command),
        resolveSourceClosedFulfillment: (command) =>
          productionSystem.cells.resolveSourceClosedFulfillment.execute(
            command,
          ),
      },
    });
    const targetCatalog = makeJobCatalogFromOwners({
      'system:ingress': ingressSystem,
      'system:production': productionSystem,
    });
    const registrations = registrationsFromJobCatalog(targetCatalog);
    const webhookRegistrations = registrations.filter(
      (registration) => registration.queue === 'webhook_ingestion',
    );
    const orderOutboxRegistrations = registrations.filter(
      (registration) => registration.queue === 'order_outbox',
    );
    const webhookRegistration = webhookRegistrations[0];
    const orderOutboxRegistration = orderOutboxRegistrations[0];
    if (webhookRegistration === undefined)
      throw new Error('Missing target webhook_ingestion registration.');
    if (orderOutboxRegistration === undefined)
      throw new Error('Missing target order_outbox registration.');
    const observedWebhookRegistration = observeProcessInboundEventRegistration({
      registration: webhookRegistration,
      clock,
      measurements: instrumentation.measurements,
    });
    const targetQueue = interceptTargetQueue(
      database.db,
      makeWebhookIngestionDurableQueue({
        cells: ingressSystem.cells,
        workerId,
        leaseMs,
        batchSize,
        backlogMeasurementIntervalMs: 60_000,
        nowNanoseconds: () => 0n,
        logger: nullLogger,
        counters: instrumentation.counters,
        measurements: instrumentation.measurements,
        errors: instrumentation.errors,
      }),
      input.transition,
    );
    const webhookJob = makeDurableQueueJob({
      job: observedWebhookRegistration,
      queue: targetQueue,
      classifyUnexpected,
      retryBaseMs,
      retryMaxMs,
      now: clock.now,
      nowNanoseconds: () => 0n,
      random: () => 0.5,
    });
    const orderOutbox = makeDurableQueueJob({
      job: orderOutboxRegistration,
      queue: makeOrderOutboxDurableQueue({
        cells: ordersSystem.cells,
        workerId,
        leaseMs,
        batchSize,
        backlogMeasurementIntervalMs: 60_000,
        nowNanoseconds: () => 0n,
        logger: nullLogger,
        counters: instrumentation.counters,
        measurements: instrumentation.measurements,
        errors: instrumentation.errors,
        toDelivery: toOrderOutboxDurableJobDelivery,
      }),
      classifyUnexpected,
      retryBaseMs,
      retryMaxMs,
      now: clock.now,
      nowNanoseconds: () => 0n,
      random: () => 0.5,
    });
    const sequential = makeSequentialDurableJob([webhookJob, orderOutbox]);
    return Object.freeze({
      runOnce: () => sequential.runOnce(new AbortController().signal),
      webhookRegistrationCount: webhookRegistrations.length,
      totalBusinessHandlerCount:
        webhookRegistrations.length + orderOutboxRegistrations.length,
    });
  };

  return Object.freeze({
    database,
    clock,
    ingressIds,
    productionIds,
    instrumentation,
    makeRunner,
  });
};

const captureRun = async (runner: ReturnType<FlowFixture['makeRunner']>) => {
  try {
    return { kind: 'success' as const, processed: await runner.runOnce() };
  } catch (failure: unknown) {
    const error = normalizeUnknownError(failure);
    return {
      kind: 'failure' as const,
      failure: {
        kind: error.kind,
        code: error.code,
        message: error.message,
        safeMessage: error.safeMessage,
        status: error.status,
      },
    };
  }
};

const selectState = async (db: PostgresDatabase) => ({
  events: await db
    .select()
    .from(presslyPostgresOwnerSchemas.ingress.webhookEvents)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.ingress.webhookEvents.receivedAt),
      asc(presslyPostgresOwnerSchemas.ingress.webhookEvents.id),
    ),
  receipts: await db
    .select()
    .from(presslyPostgresOwnerSchemas.ingress.webhookReceiptQuarantine)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.ingress.webhookReceiptQuarantine.id),
    ),
  bindings: await db
    .select()
    .from(presslyPostgresOwnerSchemas.ingress.sourceLocationBindings)
    .orderBy(
      asc(
        presslyPostgresOwnerSchemas.ingress.sourceLocationBindings
          .externalLocationId,
      ),
    ),
  proposals: await db
    .select()
    .from(presslyPostgresOwnerSchemas.orders.orderSourceProposals)
    .orderBy(
      asc(
        presslyPostgresOwnerSchemas.orders.orderSourceProposals.externalOrderId,
      ),
    ),
  tombstones: await db
    .select()
    .from(presslyPostgresOwnerSchemas.orders.orderSourceTerminalTombstones)
    .orderBy(
      asc(
        presslyPostgresOwnerSchemas.orders.orderSourceTerminalTombstones
          .externalOrderId,
      ),
    ),
  transitions: await db
    .select()
    .from(presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions)
    .orderBy(
      asc(
        presslyPostgresOwnerSchemas.orders.orderSourceProposalTransitions
          .occurredAt,
      ),
    ),
  proposalResolutions: await db
    .select()
    .from(presslyPostgresOwnerSchemas.orders.orderSourceProposalResolutions)
    .orderBy(
      asc(
        presslyPostgresOwnerSchemas.orders.orderSourceProposalResolutions
          .proposalId,
      ),
    ),
  sourceLinks: await db
    .select()
    .from(presslyPostgresOwnerSchemas.orders.orderSourceLinks)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.orders.orderSourceLinks.externalOrderId),
    ),
  sourceCustomerRefs: await db
    .select()
    .from(presslyPostgresOwnerSchemas.orders.orderSourceCustomerRefs)
    .orderBy(
      asc(
        presslyPostgresOwnerSchemas.orders.orderSourceCustomerRefs
          .orderSourceLinkId,
      ),
    ),
  sourceSnapshots: await db
    .select()
    .from(presslyPostgresOwnerSchemas.orders.orderSourceSnapshots)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.orders.orderSourceSnapshots.sourceLinkId),
    ),
  commandReceipts: await db
    .select()
    .from(presslyPostgresOwnerSchemas.orders.orderCommandReceipts)
    .orderBy(
      asc(
        presslyPostgresOwnerSchemas.orders.orderCommandReceipts.idempotencyKey,
      ),
    ),
  canonicalOrders: await db
    .select()
    .from(presslyPostgresOwnerSchemas.orders.orders)
    .orderBy(asc(presslyPostgresOwnerSchemas.orders.orders.id)),
  fulfillments: await db
    .select()
    .from(presslyPostgresOwnerSchemas.orders.orderFulfillments)
    .orderBy(asc(presslyPostgresOwnerSchemas.orders.orderFulfillments.id)),
  items: await db
    .select()
    .from(presslyPostgresOwnerSchemas.orders.orderItems)
    .orderBy(asc(presslyPostgresOwnerSchemas.orders.orderItems.id)),
  outbox: await db
    .select()
    .from(presslyPostgresOwnerSchemas.orders.orderOutboxEvents)
    .orderBy(asc(presslyPostgresOwnerSchemas.orders.orderOutboxEvents.id)),
  demands: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.orderDemands)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.orderDemands.id)),
  productionOrders: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionOrders)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.productionOrders.id)),
  productionBags: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.bags)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.bags.id)),
  productionShifts: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionShifts)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.productionShifts.id)),
  shiftSelections: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionShiftSelections)
    .orderBy(
      asc(
        presslyPostgresOwnerSchemas.production.productionShiftSelections
          .productionShiftId,
      ),
    ),
  shiftSelectedOrders: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionShiftSelectedOrders)
    .orderBy(
      asc(
        presslyPostgresOwnerSchemas.production.productionShiftSelectedOrders
          .productionOrderId,
      ),
    ),
  schedulerConfigs: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.schedulerConfigs.id)),
  scheduleRuns: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.scheduleRuns)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.scheduleRuns.id)),
  productionRuns: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionRuns)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.productionRuns.id)),
  productionBatches: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionBatches)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.productionBatches.id)),
  productionBatchOrders: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionBatchOrders)
    .orderBy(
      asc(
        presslyPostgresOwnerSchemas.production.productionBatchOrders
          .productionOrderId,
      ),
    ),
  stageRuns: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.stageRuns)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.stageRuns.id)),
  stageMachineAssignments: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.production.stageMachineAssignments.id),
    ),
  productionOrderStageAttempts: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionOrderStageAttempts)
    .orderBy(
      asc(
        presslyPostgresOwnerSchemas.production.productionOrderStageAttempts.id,
      ),
    ),
  workEvents: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.workEvents)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.workEvents.id)),
  accessLocations: await db
    .select()
    .from(presslyPostgresOwnerSchemas.access.accessProductionLocations)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.access.accessProductionLocations.id),
    ),
  productionLocations: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionLocations)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.production.productionLocations.id),
    ),
});

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;

const normalizeGeneratedDatabaseIds = (
  state: Awaited<ReturnType<typeof selectState>>,
) => {
  const replacements = new Map<string, string>();
  for (const proposal of state.proposals)
    replacements.set(proposal.id, `<proposal:${proposal.externalOrderId}>`);
  for (const tombstone of state.tombstones)
    replacements.set(tombstone.id, `<tombstone:${tombstone.externalOrderId}>`);
  for (const transition of state.transitions)
    replacements.set(
      transition.id,
      `<transition:${transition.idempotencyKey}>`,
    );
  for (const link of state.sourceLinks)
    replacements.set(link.id, `<source-link:${link.externalOrderId}>`);

  const replace = (value: unknown): unknown => {
    if (typeof value === 'string') return replacements.get(value) ?? value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(replace);
    const record = asRecord(value);
    if (record === null) return value;
    return Object.fromEntries(
      Object.entries(record).map(([key, child]) => [key, replace(child)]),
    );
  };
  const normalized = replace(state) as Awaited<ReturnType<typeof selectState>>;
  return {
    ...normalized,
    // work_events.created_at is intentionally database-default time. The
    // domain transition time remains exact in the event payload and aggregate.
    workEvents: normalized.workEvents.map((event) => ({
      ...event,
      createdAt: '<database-default-now>',
    })),
  };
};

const stableObservationOrder = <Value>(values: readonly Value[]): Value[] =>
  [...values].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );

const observeFixture = async (fixture: FlowFixture, outcome: unknown) => ({
  outcome,
  state: normalizeGeneratedDatabaseIds(await selectState(fixture.database.db)),
  clockReads: fixture.clock.reads,
  generatedIds: {
    ingress: fixture.ingressIds.generated,
    production: fixture.productionIds.generated,
  },
  counters: stableObservationOrder(fixture.instrumentation.counterValues),
  measurements: stableObservationOrder(
    fixture.instrumentation.measurementValues,
  ),
  errors: stableObservationOrder(fixture.instrumentation.errorValues),
});

type ScenarioContext = Readonly<{
  fixture: FlowFixture;
  db: PostgresDatabase;
}>;

const compare = async (
  prepare: (context: ScenarioContext) => Promise<void>,
  act: (context: ScenarioContext) => Promise<unknown>,
) => {
  await removeFaults(flowDatabase.db);
  await flowDatabase.reset();
  await seedAccessScope(flowDatabase.db);
  await seedProductionLocation(flowDatabase.db);
  await seedIngressBinding(flowDatabase.db);
  const fixture = makeFixture(flowDatabase);
  const context = { fixture, db: flowDatabase.db };
  await prepare(context);
  const outcome = await act(context);
  return observeFixture(fixture, outcome);
};

beforeAll(async () => {
  dropDatabase(flowDatabase.name);
  createDatabase(flowDatabase.name);
  await flowDatabase.check();
}, 180_000);

afterAll(async () => {
  await removeFaults(flowDatabase.db);
  await flowDatabase.close();
  dropDatabase(flowDatabase.name);
  expect(databaseExists(flowDatabase.name)).toBe(false);
}, 60_000);

describe('target webhook_ingestion cross-system conformance', () => {
  it('creates the exact SUBMITTED proposal with one catalog handler and no canonical or outbox effect', async () => {
    const eventId = uuid(301);
    const externalOrderId = 'submitted-order';
    const observed = await compare(
      ({ db }) =>
        seedEvent(db, {
          id: eventId,
          externalOrderId,
          payload: submittedPayload(externalOrderId),
        }),
      async ({ fixture }) => {
        const runner = fixture.makeRunner();
        return {
          registrations: {
            webhook: runner.webhookRegistrationCount,
            all: runner.totalBusinessHandlerCount,
          },
          run: await captureRun(runner),
        };
      },
    );

    expect(observed.outcome).toEqual({
      registrations: { webhook: 1, all: 2 },
      run: { kind: 'success', processed: 1 },
    });
    expect(observed.state).toMatchObject({
      events: [{ id: eventId, status: 'processed', attempts: 1 }],
      proposals: [
        {
          externalOrderId,
          locationId,
          state: 'pending',
          version: 1,
          estimatedWeightLbs: 18,
        },
      ],
      canonicalOrders: [],
      fulfillments: [],
      outbox: [],
      demands: [],
      productionOrders: [],
      workEvents: [],
    });
    expect(observed.measurements).toContainEqual({
      name: 'worker.processing_latency_seconds',
      value: 0,
      labels: { job: 'webhook_ingestion', source: 'cents' },
    });
  });

  it('reclaims a crash after proposal commit and completes one idempotent proposal on redelivery', async () => {
    const eventId = uuid(302);
    const externalOrderId = 'crash-redelivery';
    const observed = await compare(
      ({ db }) =>
        seedEvent(db, {
          id: eventId,
          externalOrderId,
          payload: submittedPayload(externalOrderId),
        }),
      async ({ fixture }) => {
        const first = await captureRun(
          fixture.makeRunner({ transition: 'crash-after-complete-effect' }),
        );
        const crashedState = await selectState(fixture.database.db);
        fixture.clock.set(new Date(initialNow.getTime() + leaseMs + 1));
        const redelivery = await captureRun(fixture.makeRunner());
        return {
          first,
          afterCrash: {
            event: crashedState.events[0],
            proposalCount: crashedState.proposals.length,
          },
          redelivery,
        };
      },
    );

    expect(observed.outcome).toMatchObject({
      first: {
        kind: 'failure',
        failure: {
          code: 'unexpected_error',
          message: 'crash after Orders proposal before acknowledgement',
        },
      },
      afterCrash: {
        event: {
          id: eventId,
          status: 'processing',
          attempts: 1,
          leaseOwner: 'webhook-flow-worker',
        },
        proposalCount: 1,
      },
      redelivery: { kind: 'success', processed: 1 },
    });
    expect(observed.state).toMatchObject({
      events: [{ id: eventId, status: 'processed', attempts: 2 }],
      proposals: [{ externalOrderId, state: 'pending', version: 1 }],
      outbox: [],
      workEvents: [],
    });
    expect(observed.counters).toContainEqual({
      name: 'worker.leases_recovered',
      labels: { job: 'webhook_ingestion' },
    });
  });

  it('acknowledges ignored customer, marketing and unsupported order statuses without downstream state', async () => {
    const unsupported = submittedPayload('unsupported-status');
    const observed = await compare(
      async ({ db }) => {
        await seedEvent(db, {
          id: uuid(303),
          externalOrderId: 'ignored-customer',
          subjectType: 'customer',
          payload: { ignored: true },
          receivedAt: new Date(receivedAt.getTime() + 1),
        });
        await seedEvent(db, {
          id: uuid(304),
          externalOrderId: 'ignored-marketing',
          subjectType: 'marketing',
          payload: { ignored: true },
          receivedAt: new Date(receivedAt.getTime() + 2),
        });
        await seedEvent(db, {
          id: uuid(305),
          externalOrderId: 'unsupported-status',
          payload: { ...unsupported, status: 'IN_PROGRESS' },
          receivedAt: new Date(receivedAt.getTime() + 3),
        });
      },
      ({ fixture }) => captureRun(fixture.makeRunner()),
    );

    expect(observed.outcome).toEqual({ kind: 'success', processed: 3 });
    expect(observed.state).toMatchObject({
      events: [
        { status: 'processed', attempts: 1 },
        { status: 'processed', attempts: 1 },
        { status: 'processed', attempts: 1 },
      ],
      proposals: [],
      tombstones: [],
      canonicalOrders: [],
      outbox: [],
      productionOrders: [],
    });
  });

  it('dead-letters every permanent boundary failure and continues the claimed batch', async () => {
    const validExternalOrderId = 'batch-valid-order';
    const observed = await compare(
      async ({ db }) => {
        await seedEvent(db, {
          id: uuid(310),
          externalOrderId: 'malformed-order',
          payload: { status: 'SUBMITTED', malformed: true },
          receivedAt: new Date(receivedAt.getTime() + 1),
        });
        await seedEvent(db, {
          id: uuid(311),
          externalOrderId: 'identity-order',
          subjectId: 'different-order',
          payload: submittedPayload('identity-order'),
          receivedAt: new Date(receivedAt.getTime() + 2),
        });
        await seedEvent(db, {
          id: uuid(312),
          externalOrderId: 'revision-order',
          sourceOccurredAt: new Date(sourceOccurredAt.getTime() + 1_000),
          payload: submittedPayload('revision-order'),
          receivedAt: new Date(receivedAt.getTime() + 3),
        });
        await seedEvent(db, {
          id: uuid(313),
          externalOrderId: 'unmapped-order',
          sourceLocationId: 'unmapped-store',
          payload: {
            ...submittedPayload('unmapped-order'),
            externalStoreId: 'unmapped-store',
          },
          receivedAt: new Date(receivedAt.getTime() + 4),
        });
        await seedEvent(db, {
          id: uuid(314),
          externalOrderId: 'missing-consumer-order',
          source: 'unsupported-source',
          payload: submittedPayload('missing-consumer-order'),
          receivedAt: new Date(receivedAt.getTime() + 5),
        });
        await seedEvent(db, {
          id: uuid(315),
          externalOrderId: validExternalOrderId,
          payload: submittedPayload(validExternalOrderId),
          receivedAt: new Date(receivedAt.getTime() + 6),
        });
      },
      ({ fixture }) => captureRun(fixture.makeRunner()),
    );

    expect(observed.outcome).toEqual({ kind: 'success', processed: 6 });
    expect(
      observed.state.events.map((event: { status: string }) => event.status),
    ).toEqual(['dead', 'dead', 'dead', 'dead', 'dead', 'processed']);
    expect(
      observed.state.events.map(
        (event: { lastErrorCode: string | null }) => event.lastErrorCode,
      ),
    ).toEqual([
      'cents_order_payload_invalid',
      'cents_order_identity_invalid',
      'cents_order_revision_invalid',
      'source_location_unmapped',
      'webhook_event_consumer_missing',
      null,
    ]);
    expect(observed.state.proposals).toMatchObject([
      { externalOrderId: validExternalOrderId, state: 'pending', version: 1 },
    ]);
    expect(observed.state.outbox).toEqual([]);
    expect(observed.errors.map((error) => error.code)).toEqual([
      'cents_order_identity_invalid',
      'cents_order_payload_invalid',
      'cents_order_revision_invalid',
      'source_location_unmapped',
      'webhook_event_consumer_missing',
    ]);
  });

  it('retains a terminal-before-submitted tombstone and suppresses the later proposal', async () => {
    const externalOrderId = 'terminal-before-submitted';
    const observed = await compare(
      async ({ db }) => {
        await seedEvent(db, {
          id: uuid(320),
          externalOrderId,
          payload: terminalPayload(externalOrderId),
        });
        await seedEvent(db, {
          id: uuid(321),
          externalOrderId,
          payload: submittedPayload(externalOrderId),
          receivedAt: new Date(receivedAt.getTime() + 1),
        });
      },
      ({ fixture }) => captureRun(fixture.makeRunner()),
    );

    expect(observed.outcome).toEqual({ kind: 'success', processed: 2 });
    expect(observed.state).toMatchObject({
      events: [
        { id: uuid(320), status: 'processed', attempts: 1 },
        { id: uuid(321), status: 'processed', attempts: 1 },
      ],
      proposals: [],
      tombstones: [
        {
          externalOrderId,
          proposalId: null,
          terminalCode: 'completed',
          sourceRevisionHash: 'a'.repeat(64),
        },
      ],
      transitions: [],
      canonicalOrders: [],
      outbox: [],
      productionOrders: [],
    });
  });

  it('retries an accepted terminal event until Production exists, then completes one idempotent resolution', async () => {
    const eventId = uuid(330);
    const externalOrderId = 'projection-pending-order';
    const observed = await compare(
      async ({ db }) => {
        await seedCanonicalOrder(db, externalOrderId);
        await seedEvent(db, {
          id: eventId,
          externalOrderId,
          payload: terminalPayload(externalOrderId),
        });
      },
      async ({ fixture, db }) => {
        const first = await captureRun(fixture.makeRunner());
        const afterRetry = await selectState(db);
        fixture.clock.set(new Date(initialNow.getTime() + retryBaseMs));
        await seedProductionProjection(db);
        const second = await captureRun(fixture.makeRunner());
        const replay = await captureRun(fixture.makeRunner());
        return {
          first,
          afterRetry: {
            event: afterRetry.events[0],
            tombstoneCount: afterRetry.tombstones.length,
            productionOrderCount: afterRetry.productionOrders.length,
          },
          second,
          replay,
        };
      },
    );

    expect(observed.outcome).toMatchObject({
      first: { kind: 'success', processed: 1 },
      afterRetry: {
        event: {
          id: eventId,
          status: 'pending',
          attempts: 1,
          lastErrorCode: 'production_projection_pending',
          availableAt: new Date(initialNow.getTime() + retryBaseMs),
        },
        tombstoneCount: 1,
        productionOrderCount: 0,
      },
      second: { kind: 'success', processed: 1 },
      replay: { kind: 'success', processed: 0 },
    });
    expect(observed.state).toMatchObject({
      events: [{ id: eventId, status: 'processed', attempts: 2 }],
      tombstones: [{ externalOrderId, terminalCode: 'completed' }],
      canonicalOrders: [{ id: ids.canonicalOrder, state: 'open' }],
      fulfillments: [{ id: ids.fulfillment, releaseState: 'unreleased' }],
      outbox: [],
      productionOrders: [
        {
          id: ids.productionOrder,
          resolutionState: 'resolved_without_production',
          resolutionReason: 'order_will_not_be_produced',
          version: 5,
        },
      ],
      workEvents: [
        {
          id: ids.productionGenerated[0],
          eventType: 'production_order_resolved_without_production',
          idempotencyKey: `source-closed-fulfillment:${eventId}`,
        },
      ],
      accessLocations: [{ id: locationId }],
      productionLocations: [{ id: locationId, liveRevision: 1 }],
    });
    expect(observed.generatedIds.production).toEqual([
      ids.productionGenerated[0],
    ]);
    expect(observed.counters).toContainEqual({
      name: 'worker.jobs_retried',
      labels: { job: 'webhook_ingestion', source: 'cents' },
    });
  });

  it.each([
    {
      name: 'already resolved',
      releaseState: 'unreleased' as const,
      admissionState: 'unreleased' as const,
      resolutionState: 'resolved_without_production' as const,
      expectedResolution: 'resolved_without_production',
      expectedWorkEvents: 0,
    },
    {
      name: 'review required',
      releaseState: 'released' as const,
      admissionState: 'released' as const,
      resolutionState: 'open' as const,
      expectedResolution: 'open',
      expectedWorkEvents: 0,
    },
  ])(
    'acknowledges canonical source closure when Production is $name',
    async ({
      releaseState,
      admissionState,
      resolutionState,
      expectedResolution,
      expectedWorkEvents,
    }) => {
      const externalOrderId = `canonical-${expectedResolution}-${releaseState}`;
      const observed = await compare(
        async ({ db }) => {
          await seedCanonicalOrder(db, externalOrderId, releaseState);
          await seedProductionProjection(db, {
            admissionState,
            resolutionState,
          });
          await seedEvent(db, {
            id: uuid(releaseState === 'released' ? 341 : 340),
            externalOrderId,
            payload: terminalPayload(externalOrderId, 'CANCELED'),
          });
        },
        ({ fixture }) => captureRun(fixture.makeRunner()),
      );

      expect(observed.outcome).toEqual({ kind: 'success', processed: 1 });
      expect(observed.state.productionOrders).toMatchObject([
        { resolutionState: expectedResolution },
      ]);
      expect(observed.state.workEvents).toHaveLength(expectedWorkEvents);
      expect(observed.state.events).toMatchObject([
        { status: 'processed', attempts: 1 },
      ]);
      expect(observed.state.outbox).toEqual([]);
    },
  );

  it('rolls back an unexpected proposal fault, retries, and commits only after the fault clears', async () => {
    const eventId = uuid(350);
    const externalOrderId = 'transient-proposal-fault';
    const observed = await compare(
      async ({ db }) => {
        await seedEvent(db, {
          id: eventId,
          externalOrderId,
          payload: submittedPayload(externalOrderId),
        });
        await installProposalFault(db);
      },
      async ({ fixture, db }) => {
        const first = await captureRun(fixture.makeRunner());
        const afterFault = await selectState(db);
        await removeFaults(db);
        fixture.clock.set(new Date(initialNow.getTime() + retryBaseMs));
        const second = await captureRun(fixture.makeRunner());
        return {
          first,
          afterFault: {
            event: afterFault.events[0],
            proposals: afterFault.proposals,
            outbox: afterFault.outbox,
          },
          second,
        };
      },
    );

    expect(observed.outcome).toMatchObject({
      first: { kind: 'success', processed: 1 },
      afterFault: {
        event: {
          id: eventId,
          status: 'pending',
          attempts: 1,
          lastErrorCode: 'incoming_order_proposal_failed',
        },
        proposals: [],
        outbox: [],
      },
      second: { kind: 'success', processed: 1 },
    });
    expect(observed.state).toMatchObject({
      events: [{ id: eventId, status: 'processed', attempts: 2 }],
      proposals: [{ externalOrderId, state: 'pending', version: 1 }],
      outbox: [],
    });
  });

  it('dead-letters a transient unexpected failure on authoritative attempt eight', async () => {
    const eventId = uuid(351);
    const observed = await compare(
      async ({ db }) => {
        await seedEvent(db, {
          id: eventId,
          externalOrderId: 'attempt-eight-fault',
          payload: submittedPayload('attempt-eight-fault'),
          attempts: 7,
        });
        await installProposalFault(db);
      },
      ({ fixture }) => captureRun(fixture.makeRunner()),
    );

    expect(observed.outcome).toEqual({ kind: 'success', processed: 1 });
    expect(observed.state).toMatchObject({
      events: [
        {
          id: eventId,
          status: 'dead',
          attempts: 8,
          lastErrorCode: 'incoming_order_proposal_failed',
        },
      ],
      proposals: [],
      outbox: [],
    });
  });

  it('recovers an expired lease, increments the durable attempt and records the recovery metric', async () => {
    const eventId = uuid(360);
    const payload = submittedPayload('expired-lease');
    const observed = await compare(
      ({ db }) =>
        seedEvent(db, {
          id: eventId,
          externalOrderId: 'expired-lease',
          payload: { ...payload, status: 'IN_PROGRESS' },
          status: 'processing',
          attempts: 1,
          leaseOwner: 'crashed-worker',
          leaseExpiresAt: new Date(initialNow.getTime() - 1),
        }),
      ({ fixture }) => captureRun(fixture.makeRunner()),
    );

    expect(observed.outcome).toEqual({ kind: 'success', processed: 1 });
    expect(observed.state.events).toMatchObject([
      {
        id: eventId,
        status: 'processed',
        attempts: 2,
        leaseOwner: null,
      },
    ]);
    expect(observed.counters).toContainEqual({
      name: 'worker.leases_recovered',
      labels: { job: 'webhook_ingestion' },
    });
  });

  it.each([
    {
      name: 'complete',
      transition: 'lose-complete-lease' as const,
      payload: {
        ...submittedPayload('lease-loss-complete'),
        status: 'IN_PROGRESS',
      },
      disposition: 'complete',
      fault: false,
    },
    {
      name: 'retry',
      transition: 'lose-retry-lease' as const,
      payload: submittedPayload('lease-loss-retry'),
      disposition: 'retry',
      fault: true,
    },
    {
      name: 'dead letter',
      transition: 'lose-dead-lease' as const,
      payload: { status: 'SUBMITTED', malformed: true },
      disposition: 'dead',
      fault: false,
    },
  ])(
    'fences a stale $name transition without regressing the winning lease',
    async ({ transition, payload, disposition, fault }) => {
      const eventId = uuid(
        disposition === 'complete' ? 370 : disposition === 'retry' ? 371 : 372,
      );
      const observed = await compare(
        async ({ db }) => {
          await seedEvent(db, {
            id: eventId,
            externalOrderId: `lease-loss-${disposition}`,
            payload,
          });
          if (fault) await installProposalFault(db);
        },
        ({ fixture }) => captureRun(fixture.makeRunner({ transition })),
      );

      expect(observed.outcome).toEqual({ kind: 'success', processed: 1 });
      expect(observed.state.events).toMatchObject([
        {
          id: eventId,
          status: 'processing',
          attempts: 2,
          leaseOwner: 'winning-worker',
          lastErrorCode: null,
        },
      ]);
      expect(observed.counters).toContainEqual({
        name: 'worker.lease_losses',
        labels: { job: 'webhook_ingestion', disposition },
      });
    },
  );

  it('runs backlog measurement and quarantine purge after an idle pass', async () => {
    const observed = await compare(
      async ({ db }) => {
        await seedEvent(db, {
          id: uuid(380),
          externalOrderId: 'future-event',
          availableAt: new Date(initialNow.getTime() + 86_400_000),
        });
        await seedExpiredReceipt(db);
      },
      ({ fixture }) => captureRun(fixture.makeRunner()),
    );

    expect(observed.outcome).toEqual({ kind: 'success', processed: 0 });
    expect(observed.state.receipts).toEqual([]);
    expect(observed.state.events).toMatchObject([
      { id: uuid(380), status: 'pending', attempts: 0 },
    ]);
    expect(observed.measurements).toContainEqual({
      name: 'worker.inbox_pending_count',
      value: 1,
      labels: { job: 'webhook_ingestion' },
    });
    expect(observed.measurements).toContainEqual({
      name: 'worker.inbox_oldest_pending_age_seconds',
      value: 60,
      labels: { job: 'webhook_ingestion' },
    });
  });

  it('rolls back tombstone and proposal state together when the source-close transition insert faults', async () => {
    const externalOrderId = 'terminal-transition-rollback';
    const observed = await compare(
      async ({ db }) => {
        await seedEvent(db, {
          id: uuid(390),
          externalOrderId,
          payload: submittedPayload(externalOrderId),
        });
        await seedEvent(db, {
          id: uuid(391),
          externalOrderId,
          payload: terminalPayload(externalOrderId),
          receivedAt: new Date(receivedAt.getTime() + 1),
        });
      },
      async ({ fixture, db }) => {
        const submitted = await captureRun(
          fixture.makeRunner({ batchSize: 1 }),
        );
        await installTransitionFault(db);
        const faulted = await captureRun(fixture.makeRunner({ batchSize: 1 }));
        const afterFault = await selectState(db);
        await removeFaults(db);
        fixture.clock.set(new Date(initialNow.getTime() + retryBaseMs));
        const recovered = await captureRun(
          fixture.makeRunner({ batchSize: 1 }),
        );
        return {
          submitted,
          faulted,
          afterFault: {
            proposal:
              afterFault.proposals[0] === undefined
                ? null
                : {
                    externalOrderId: afterFault.proposals[0].externalOrderId,
                    state: afterFault.proposals[0].state,
                    version: afterFault.proposals[0].version,
                  },
            tombstones: afterFault.tombstones,
            transitions: afterFault.transitions,
          },
          recovered,
        };
      },
    );

    expect(observed.outcome).toMatchObject({
      submitted: { kind: 'success', processed: 1 },
      faulted: { kind: 'success', processed: 1 },
      afterFault: {
        proposal: { externalOrderId, state: 'pending', version: 1 },
        tombstones: [],
        transitions: [],
      },
      recovered: { kind: 'success', processed: 1 },
    });
    expect(observed.state).toMatchObject({
      events: [
        { id: uuid(390), status: 'processed', attempts: 1 },
        { id: uuid(391), status: 'processed', attempts: 2 },
      ],
      proposals: [{ externalOrderId, state: 'source_closed', version: 2 }],
      tombstones: [{ externalOrderId, terminalCode: 'completed' }],
      transitions: [
        {
          fromState: 'pending',
          toState: 'source_closed',
          eventType: 'source_close',
          proposalVersion: 2,
        },
      ],
      outbox: [],
    });
  });

  it('serializes concurrent same-source proposals behind one durable proposal identity', async () => {
    const externalOrderId = 'same-source-concurrency';
    const observed = await compare(
      async ({ db }) => {
        await seedEvent(db, {
          id: uuid(400),
          externalOrderId,
          payload: submittedPayload(externalOrderId),
        });
        await seedEvent(db, {
          id: uuid(401),
          externalOrderId,
          payload: submittedPayload(externalOrderId),
          receivedAt: new Date(receivedAt.getTime() + 1),
        });
      },
      ({ fixture }) => {
        const runner = fixture.makeRunner({ batchSize: 1 });
        return Promise.all([captureRun(runner), captureRun(runner)]);
      },
    );

    expect(observed.outcome).toEqual([
      { kind: 'success', processed: 1 },
      { kind: 'success', processed: 1 },
    ]);
    expect(observed.state).toMatchObject({
      events: [
        { id: uuid(400), status: 'processed', attempts: 1 },
        { id: uuid(401), status: 'processed', attempts: 1 },
      ],
      proposals: [{ externalOrderId, state: 'pending', version: 1 }],
      outbox: [],
    });
  });
});
