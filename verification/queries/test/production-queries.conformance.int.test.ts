import {
  makeProductionActorReadV1Capability,
  makeProductionScopeReconciliationV1Capability,
} from '@pressly/access-system/assembly/production-capabilities';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import type { ListHistoryRunsInput } from '@pressly/production-system/operations/history/list-runs/types';
import type { ListLocationsInput } from '@pressly/production-system/operations/resources/list-locations/types';
import type { ListOrdersInput } from '@pressly/production-system/operations/orders/list-orders/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  listHistoryRunsConformanceScenarios,
  listLocationsConformanceScenarios,
  listOrdersConformanceScenarios,
  productionQueryConformanceAsOf,
  productionQueryConformanceIds as ids,
  productionQueryConformanceLocations as locations,
  runQueryConformanceScenario,
  type CanonicalQueryOutcome,
  type QueryConformanceObservation,
  type QueryConformanceScenario,
} from '../src/public.ts';
import {
  createProductionQueryConformanceDatabase,
  readProductionQueryState,
  seedProductionQueryConformance,
  type ProductionQueryReadState,
} from './support/production-query-conformance-fixture.ts';

const database = createProductionQueryConformanceDatabase();

beforeAll(database.check);
afterAll(database.close);

type Clock = Readonly<{ now: () => Date }>;
type TimingEvent = 'clock' | 'read';

type ConformanceObservation =
  QueryConformanceObservation<ProductionQueryReadState> &
    Readonly<{ timing: readonly TimingEvent[] }>;

type ProductionCells = ReturnType<typeof makeProductionSystem>['cells'];

const makeIds = (): IdSource => ({ next: () => ids.actor });

const makeClock = (events: TimingEvent[]): Clock => ({
  now: () => {
    events.push('clock');
    return new Date(productionQueryConformanceAsOf);
  },
});

const observeDatabaseReads = (
  db: PostgresDatabase,
  events: TimingEvent[],
): PostgresDatabase =>
  new Proxy(db, {
    get: (target, property) => {
      const value = Reflect.get(target, property, target);
      if (
        (property === 'select' || property === 'transaction') &&
        typeof value === 'function'
      )
        return (...args: unknown[]) => {
          events.push('read');
          return Reflect.apply(value, target, args);
        };
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

const observeQuery = async <Input extends object>(input: {
  scenario: QueryConformanceScenario<Input>;
  select: (
    cells: ProductionCells,
  ) => Readonly<{ execute: (query: Input) => Promise<unknown> }>;
}): Promise<ConformanceObservation> => {
  await database.reset();
  await seedProductionQueryConformance(database.db);
  const before = await readProductionQueryState(database.db);

  const timing: TimingEvent[] = [];
  const observedDb = observeDatabaseReads(database.db, timing);
  const cells = makeProductionSystem({
    schema: presslyPostgresOwnerSchemas.production,
    productionActorReadV1: makeProductionActorReadV1Capability(
      observedDb,
      presslyPostgresOwnerSchemas.access,
    ),
    productionScopeReconciliationV1:
      makeProductionScopeReconciliationV1Capability(
        observedDb,
        presslyPostgresOwnerSchemas.access,
      ),
    db: observedDb,
    ids: makeIds(),
    clock: makeClock(timing),
  }).cells;
  const outcome = await runQueryConformanceScenario(
    input.select(cells).execute,
    input.scenario,
  );
  const after = await readProductionQueryState(database.db);

  return {
    outcome,
    state: { before, after },
    timing,
  };
};

const assertReadOnly = (observation: ConformanceObservation): void => {
  expect(observation.state.after).toEqual(observation.state.before);
};

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const successValue = (
  outcome: CanonicalQueryOutcome | undefined,
): Readonly<Record<string, unknown>> => {
  expect(outcome?.kind).toBe('success');
  const value = outcome?.kind === 'success' ? record(outcome.value) : null;
  expect(value).not.toBeNull();
  return value ?? {};
};

const itemRecords = (
  outcome: CanonicalQueryOutcome | undefined,
): readonly Readonly<Record<string, unknown>>[] => {
  const items = successValue(outcome)['items'];
  return Array.isArray(items)
    ? items.map((item) => record(item) ?? {})
    : Object.freeze([]);
};

const itemIds = (
  outcome: CanonicalQueryOutcome | undefined,
  field: string,
): readonly unknown[] => itemRecords(outcome).map((item) => item[field]);

const cursorEnvelope = (
  outcome: CanonicalQueryOutcome | undefined,
): Readonly<Record<string, unknown>> => {
  const cursor = successValue(outcome)['nextCursor'];
  expect(typeof cursor).toBe('string');
  if (typeof cursor !== 'string') return {};
  return (
    record(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))) ?? {}
  );
};

const expectClockAfterRead = (events: readonly TimingEvent[]): void => {
  expect(events[0]).toBe('read');
  expect(events).toContain('clock');
  expect(events.indexOf('clock')).toBeGreaterThan(events.indexOf('read'));
};

const expectClockBeforeRead = (events: readonly TimingEvent[]): void => {
  expect(events[0]).toBe('clock');
  expect(events).toContain('read');
  expect(events.indexOf('clock')).toBeLessThan(events.indexOf('read'));
};

describe('production.list-locations.v1 target conformance', () => {
  it.each(listLocationsConformanceScenarios)('$name', async (scenario) => {
    const observation = await observeQuery<ListLocationsInput>({
      scenario,
      select: (cells) => cells.listLocations,
    });

    assertReadOnly(observation);
    if (scenario.name.startsWith('an empty authorization')) {
      expect(observation.timing).toEqual(['clock']);
    } else {
      expectClockAfterRead(observation.timing);
    }

    if (scenario.name.startsWith('null authorization')) {
      expect(itemIds(observation.outcome[0], 'id')).toEqual([
        locations.alpha,
        locations.main,
        locations.sibling,
      ]);
      expect(successValue(observation.outcome[0])['asOf']).toBe(
        productionQueryConformanceAsOf.toISOString(),
      );
      return;
    }
    if (scenario.name.startsWith('include-inactive')) {
      expect(itemIds(observation.outcome[0], 'id')).toEqual([
        locations.alpha,
        locations.main,
        locations.inactive,
        locations.sibling,
      ]);
      return;
    }
    if (scenario.name.startsWith('authorization-derived')) {
      expect(itemIds(observation.outcome[0], 'id')).toEqual([locations.main]);
      expect(itemIds(observation.outcome[1], 'id')).toEqual([
        locations.main,
        locations.inactive,
      ]);
      return;
    }
    expect(itemIds(observation.outcome[0], 'id')).toEqual([]);
  });
});

describe('production.list-orders.v1 target conformance', () => {
  it.each(listOrdersConformanceScenarios)('$name', async (scenario) => {
    const observation = await observeQuery<ListOrdersInput>({
      scenario,
      select: (cells) => cells.listOrders,
    });

    assertReadOnly(observation);
    expectClockBeforeRead(observation.timing);

    if (scenario.name.startsWith('defaults')) {
      expect(itemIds(observation.outcome[0], 'id')).toEqual(
        ids.productionOrders.slice(0, 4),
      );
      expect(itemRecords(observation.outcome[0])).toEqual([
        expect.objectContaining({
          externalOrderId: 'DISPLAY-OVERDUE',
          dueBucket: 'overdue',
        }),
        expect.objectContaining({
          externalOrderId: 'DISPLAY-TODAY',
          dueBucket: 'today',
          priority: true,
        }),
        expect.objectContaining({
          externalOrderId: 'DISPLAY-TOMORROW',
          dueBucket: 'tomorrow',
          bagCount: null,
          intakeVersion: null,
        }),
        expect.objectContaining({
          externalOrderId: 'DISPLAY-LATER',
          dueBucket: 'later',
        }),
      ]);
      expect(successValue(observation.outcome[0])['asOf']).toBe(
        productionQueryConformanceAsOf.toISOString(),
      );
      return;
    }
    if (scenario.name.startsWith('status and strict')) {
      expect(itemIds(observation.outcome[0], 'id')).toEqual([
        ids.productionOrders[1],
      ]);
      expect(itemIds(observation.outcome[1], 'id')).toEqual([
        ids.productionOrders[1],
      ]);
      return;
    }
    if (scenario.name.startsWith('cursor bytes')) {
      expect(observation.outcome).toHaveLength(2);
      expect(
        observation.outcome.flatMap((outcome) => itemIds(outcome, 'id')),
      ).toEqual(ids.productionOrders.slice(0, 4));
      const cursor = successValue(observation.outcome[0])['nextCursor'];
      expect(typeof cursor).toBe('string');
      expect(
        typeof cursor === 'string'
          ? Buffer.from(cursor, 'base64url').toString('utf8')
          : null,
      ).toBe(ids.productionOrders[1]);
      return;
    }
    expect(observation.outcome).toMatchObject([
      {
        kind: 'failure',
        failure: {
          tag: 'ProductionFailure',
          kind: 'validation',
          classification: 'malformed',
          code: 'production_order_cursor_invalid',
        },
      },
      {
        kind: 'failure',
        failure: {
          tag: 'ProductionFailure',
          kind: 'not_found',
          code: 'production_location_not_found',
        },
      },
      {
        kind: 'failure',
        failure: {
          tag: 'ProductionFailure',
          kind: 'not_found',
          code: 'production_location_not_found',
        },
      },
    ]);
  });
});

describe('production.list-history-runs.v1 target conformance', () => {
  it.each(listHistoryRunsConformanceScenarios)('$name', async (scenario) => {
    const observation = await observeQuery<ListHistoryRunsInput>({
      scenario,
      select: (cells) => cells.listHistoryRuns,
    });

    assertReadOnly(observation);
    expectClockBeforeRead(observation.timing);

    if (scenario.name.startsWith('defaults')) {
      expect(itemIds(observation.outcome[0], 'productionRunId')).toEqual([
        ids.productionRuns[2],
        ids.productionRuns[1],
        ids.productionRuns[0],
      ]);
      expect(itemRecords(observation.outcome[0])).toEqual([
        expect.objectContaining({
          productionRunId: ids.productionRuns[2],
          batchCount: 2,
          completedBatchCount: 1,
          orderCount: 2,
          priorityOrderCount: 1,
          totalWeightLbs: 70,
        }),
        expect.objectContaining({
          productionRunId: ids.productionRuns[1],
          batchCount: 1,
          completedBatchCount: 1,
          orderCount: 1,
          priorityOrderCount: 0,
          totalWeightLbs: 25,
        }),
        expect.objectContaining({
          productionRunId: ids.productionRuns[0],
          batchCount: 0,
          completedBatchCount: 0,
          orderCount: 0,
          priorityOrderCount: 0,
          totalWeightLbs: 0,
        }),
      ]);
      expect(successValue(observation.outcome[0])['asOf']).toBe(
        productionQueryConformanceAsOf.toISOString(),
      );
      return;
    }
    if (scenario.name.startsWith('search status')) {
      expect(itemIds(observation.outcome[0], 'productionRunId')).toEqual([
        ids.productionRuns[1],
      ]);
      expect(itemIds(observation.outcome[1], 'productionRunId')).toEqual([
        ids.productionRuns[1],
        ids.productionRuns[0],
      ]);
      expect(itemIds(observation.outcome[2], 'productionRunId')).toEqual([
        ids.productionRuns[2],
        ids.productionRuns[1],
      ]);
      return;
    }
    if (scenario.name.startsWith('cursor bytes')) {
      expect(observation.outcome).toHaveLength(3);
      expect(
        observation.outcome.flatMap((outcome) =>
          itemIds(outcome, 'productionRunId'),
        ),
      ).toEqual([
        ids.productionRuns[2],
        ids.productionRuns[1],
        ids.productionRuns[0],
      ]);
      expect(cursorEnvelope(observation.outcome[0])).toMatchObject({
        version: 2,
        kind: 'runs',
        createdAtKey: '2026-08-21T15:45:00.000900Z',
        id: ids.productionRuns[2],
      });
      expect(cursorEnvelope(observation.outcome[1])).toMatchObject({
        version: 2,
        kind: 'runs',
        createdAtKey: '2026-08-21T15:45:00.000000Z',
        id: ids.productionRuns[1],
      });
      expect(itemRecords(observation.outcome[0])[0]).toMatchObject({
        batchCount: 2,
        orderCount: 2,
        totalWeightLbs: 70,
      });
      expect(itemRecords(observation.outcome[1])[0]).toMatchObject({
        batchCount: 1,
        orderCount: 1,
        totalWeightLbs: 25,
      });
      return;
    }
    if (scenario.name.startsWith('history cursor')) {
      expect(observation.outcome[1]).toMatchObject({
        kind: 'failure',
        failure: {
          tag: 'ProductionFailure',
          kind: 'validation',
          classification: 'malformed',
          code: 'production_history_cursor_invalid',
        },
      });
      return;
    }
    expect(observation.outcome).toMatchObject([
      {
        kind: 'failure',
        failure: {
          code: 'production_history_cursor_invalid',
          kind: 'validation',
        },
      },
      {
        kind: 'failure',
        failure: {
          code: 'production_location_not_found',
          kind: 'not_found',
        },
      },
      {
        kind: 'success',
        value: {
          items: [],
          nextCursor: null,
          asOf: productionQueryConformanceAsOf.toISOString(),
        },
      },
    ]);
  });
});
