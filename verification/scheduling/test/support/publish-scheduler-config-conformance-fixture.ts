import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type {
  PostgresDatabase,
  PostgresTransaction,
} from '@pressly/postgres/client';
import { asc } from '@pressly/postgres/query';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import {
  publishSchedulerConfigConformanceIds as ids,
  publishSchedulerConfigConformanceLocationId as locationId,
  type PublishSchedulerConfigDatabaseCall,
  type PublishSchedulerConfigConformanceFixture,
  type PublishSchedulerConfigState,
} from '../../src/public.ts';

const productionSchema = presslyPostgresOwnerSchemas.production;

const databaseUrl = getTestDatabaseUrl(
  'PRESSLY_PUBLISH_SCHEDULER_CONFIG_DATABASE_URL',
  'postgres://pressly:pressly@localhost:55434/pressly_publish_scheduler_config_conformance_test',
);

export const createPublishSchedulerConfigConformanceDatabase = () =>
  createTestDatabaseRuntime({
    databaseUrl,
    tableNames: ['production_locations'],
    maxConnections: 8,
  });

const historicalPublishedAt = new Date('2026-08-20T14:00:00.000Z');
const currentPublishedAt = new Date('2026-08-21T14:00:00.000Z');

export const seedPublishSchedulerConfigConformance = async (
  database: PostgresDatabase,
  fixture: PublishSchedulerConfigConformanceFixture,
): Promise<void> => {
  await database.insert(productionSchema.productionLocations).values({
    id: locationId,
    businessId: ids.business,
    name: 'Publish Scheduler Config Conformance Facility',
    timezone: 'America/New_York',
  });
  await database.insert(productionSchema.schedulerConfigs).values([
    {
      id: ids.historicalConfig,
      locationId,
      pulseMinutes: 48,
      foldLbsPerFolderMinute: 1.75,
      algorithmVersion: 'fixed-pulse-ffd-v1',
      version: 2,
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
        assertedBy: ids.actor,
        assertedAt: historicalPublishedAt.toISOString(),
      },
      assertedBy: ids.actor,
      publishedAt: historicalPublishedAt,
    },
    {
      id: ids.currentConfig,
      locationId,
      pulseMinutes: 52,
      foldLbsPerFolderMinute: 1.9,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 7,
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
        assertedBy: ids.actor,
        assertedAt: currentPublishedAt.toISOString(),
      },
      assertedBy: ids.actor,
      publishedAt: currentPublishedAt,
    },
  ]);

  if (fixture === 'late-event-collision')
    await database.insert(productionSchema.workEvents).values({
      id: ids.collisionEvent,
      locationId,
      eventType: 'fixture_event',
      entityType: 'fixture',
      entityId: ids.fixtureEntity,
      actorId: ids.actor,
      expectedVersion: null,
      idempotencyKey: 'publish-scheduler-config-existing-event',
      payload: { fixture: true },
    });
};

const normalized = <Value>(value: Value): Value =>
  JSON.parse(JSON.stringify(value)) as Value;

const idempotencyReceipt = (payload: unknown): unknown | null => {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
    return null;
  return Reflect.get(payload, '_idempotency') ?? null;
};

export const readPublishSchedulerConfigState = async (
  database: PostgresDatabase,
): Promise<PublishSchedulerConfigState> => {
  const configs = normalized(
    await database
      .select()
      .from(productionSchema.schedulerConfigs)
      .orderBy(asc(productionSchema.schedulerConfigs.version)),
  );
  const workEvents = normalized(
    (
      await database
        .select()
        .from(productionSchema.workEvents)
        .orderBy(asc(productionSchema.workEvents.id))
    ).map((event) => ({
      id: event.id,
      locationId: event.locationId,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actorId: event.actorId,
      expectedVersion: event.expectedVersion,
      idempotencyKey: event.idempotencyKey,
      payload: event.payload,
    })),
  );
  const [location] = await database
    .select({
      liveRevision: productionSchema.productionLocations.liveRevision,
    })
    .from(productionSchema.productionLocations);
  return Object.freeze({
    configs: Object.freeze(configs),
    workEvents: Object.freeze(workEvents),
    idempotencyReceipts: Object.freeze(
      workEvents
        .map((event) => idempotencyReceipt(event.payload))
        .filter((receipt) => receipt !== null),
    ),
    liveRevision: Number(location?.liveRevision ?? -1),
  });
};

type VersionReadGate = () => Promise<void>;
type AdvisoryLockRequestObserver = () => void;
type QueryFulfilled = (value: unknown) => unknown;
type QueryRejected = (reason: unknown) => unknown;
type Then = (onFulfilled: QueryFulfilled, onRejected: QueryRejected) => unknown;

const gatedQuery = (query: object, afterVersionRead: VersionReadGate): object =>
  new Proxy(query, {
    get: (target, property) => {
      const candidate = Reflect.get(target, property, target) as unknown;
      if (property === 'then' && typeof candidate === 'function') {
        const then = candidate as Then;
        return (onFulfilled: QueryFulfilled, onRejected: QueryRejected) =>
          then.call(
            target,
            (value) =>
              afterVersionRead().then(() => onFulfilled(value), onRejected),
            onRejected,
          );
      }
      if (typeof candidate !== 'function') return candidate;
      return (...args: unknown[]) => {
        const next = Reflect.apply(candidate, target, args) as unknown;
        return typeof next === 'object' && next !== null
          ? gatedQuery(next, afterVersionRead)
          : next;
      };
    },
  });

const selectedCall = (
  fields: unknown,
): PublishSchedulerConfigDatabaseCall | null => {
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields))
    return null;
  const keys = Object.keys(fields).sort();
  if (keys.length === 1 && keys[0] === 'payload') return 'find_work_event';
  if (keys.length === 1 && keys[0] === 'version')
    return 'next_scheduler_config_version';
  return null;
};

const trackedTransaction = (
  transaction: PostgresTransaction,
  calls: PublishSchedulerConfigDatabaseCall[],
  afterVersionRead?: VersionReadGate,
  onAdvisoryLockRequest?: AdvisoryLockRequestObserver,
): PostgresTransaction =>
  new Proxy(transaction, {
    get: (target, property) => {
      const candidate = Reflect.get(target, property, target) as unknown;
      if (property === 'select')
        return (fields: unknown) => {
          const call = selectedCall(fields);
          if (call !== null) calls.push(call);
          const query = Reflect.apply(
            candidate as (...args: unknown[]) => unknown,
            target,
            [fields],
          );
          return call === 'next_scheduler_config_version' &&
            afterVersionRead !== undefined &&
            typeof query === 'object' &&
            query !== null
            ? gatedQuery(query, afterVersionRead)
            : query;
        };
      if (property === 'insert')
        return (table: unknown) => {
          if (table === productionSchema.schedulerConfigs)
            calls.push('save_scheduler_config');
          if (table === productionSchema.workEvents)
            calls.push('append_work_event');
          return Reflect.apply(
            candidate as (...args: unknown[]) => unknown,
            target,
            [table],
          );
        };
      if (property === 'execute')
        return (...args: unknown[]) => {
          calls.push('execute_sql');
          onAdvisoryLockRequest?.();
          return Reflect.apply(
            candidate as (...args: unknown[]) => unknown,
            target,
            args,
          );
        };
      return typeof candidate === 'function'
        ? candidate.bind(target)
        : candidate;
    },
  });

export const trackedPublishSchedulerConfigDatabase = (input: {
  database: PostgresDatabase;
  calls: PublishSchedulerConfigDatabaseCall[];
  afterVersionRead?: VersionReadGate;
  onAdvisoryLockRequest?: AdvisoryLockRequestObserver;
}): PostgresDatabase =>
  new Proxy(input.database, {
    get: (target, property) => {
      const candidate = Reflect.get(target, property, target) as unknown;
      if (property === 'transaction')
        return (
          work: (transaction: PostgresTransaction) => Promise<unknown>,
        ) => {
          input.calls.push('transaction');
          return target.transaction((transaction) =>
            work(
              trackedTransaction(
                transaction,
                input.calls,
                input.afterVersionRead,
                input.onAdvisoryLockRequest,
              ),
            ),
          );
        };
      return typeof candidate === 'function'
        ? candidate.bind(target)
        : candidate;
    },
  }) as PostgresDatabase;
