import { schedulingProductionSystemDependencies } from './support/production-system-dependencies.ts';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { IdSource } from '@pressly/cells/id-source';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  captureLoadScheduleOutcome,
  loadScheduleConformanceIds as ids,
  loadScheduleConformanceLocationId as locationId,
  loadScheduleConformanceScenarios,
  loadScheduleConformanceSiblingLocationId as siblingLocationId,
  loadScheduleExpectedProposal,
  loadScheduleOutcomeCode,
  type CanonicalLoadScheduleOutcome,
  type LoadScheduleConformanceScenario,
  type LoadScheduleConformanceVariant,
} from '../src/public.ts';
import {
  createLoadScheduleConformanceDatabase,
  readLoadScheduleConformanceState,
  seedLoadScheduleConformance,
} from './support/load-schedule-conformance-fixture.ts';

const database = createLoadScheduleConformanceDatabase();

beforeAll(database.check);
afterAll(database.close);

const trackedDatabase = (calls: string[]): PostgresDatabase =>
  new Proxy(database.db, {
    get: (target, property) => {
      const candidate = Reflect.get(target, property, target) as unknown;
      if (typeof candidate !== 'function') return candidate;
      const operation = candidate as (...args: unknown[]) => unknown;
      if (property === 'select')
        return (...args: unknown[]) => {
          calls.push('repository.select');
          return operation.apply(target, args);
        };
      if (property === 'transaction')
        return (...args: unknown[]) => {
          calls.push('repository.transaction');
          return operation.apply(target, args);
        };
      return operation.bind(target);
    },
  }) as PostgresDatabase;

const makeTrackedDependencies = () => {
  const calls: string[] = [];
  let clockReads = 0;
  let idReads = 0;
  const ids: IdSource = {
    next: () => {
      idReads += 1;
      return '35000000-0000-4000-8000-000000000001';
    },
  };
  return {
    db: trackedDatabase(calls),
    ids,
    clock: {
      now: () => {
        clockReads += 1;
        return new Date('2026-08-22T18:00:00.000Z');
      },
    },
    calls: () => calls,
    clockReads: () => clockReads,
    idReads: () => idReads,
  };
};

const makeTarget = (): LoadScheduleConformanceVariant => {
  const tracked = makeTrackedDependencies();
  const system = makeProductionSystem({
    ...tracked,
    ...schedulingProductionSystemDependencies(),
  });
  return {
    execute: system.cells.loadSchedule.execute,
    calls: tracked.calls,
    clockReads: tracked.clockReads,
    idReads: tracked.idReads,
  };
};

type LoadScheduleObservation = Readonly<{
  before: Readonly<Record<string, unknown>>;
  after: Readonly<Record<string, unknown>>;
  outcome: CanonicalLoadScheduleOutcome;
  calls: readonly string[];
  clockReads: number;
  idReads: number;
}>;

const observe = async (
  scenario: LoadScheduleConformanceScenario,
  makeVariant: () => LoadScheduleConformanceVariant,
): Promise<LoadScheduleObservation> => {
  await database.reset();
  await seedLoadScheduleConformance(database.db, scenario.fixture);
  const before = await readLoadScheduleConformanceState(database.db);
  const variant = makeVariant();
  const outcome = await captureLoadScheduleOutcome(
    variant.execute,
    scenario.input,
  );
  return {
    before,
    after: await readLoadScheduleConformanceState(database.db),
    outcome,
    calls: [...variant.calls()],
    clockReads: variant.clockReads(),
    idReads: variant.idReads(),
  };
};

const rows = (
  state: Readonly<Record<string, unknown>>,
  key: string,
): readonly Readonly<Record<string, unknown>>[] => {
  const value = state[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Readonly<Record<string, unknown>> =>
      typeof row === 'object' && row !== null && !Array.isArray(row),
  );
};

const expectedNotFound = {
  kind: 'failure',
  failure: {
    tag: 'ProductionFailure',
    kind: 'not_found',
    code: 'schedule_not_found',
    message: 'The schedule proposal was not found.',
    safeMessage: 'The schedule proposal was not found.',
    status: null,
  },
} as const;

const expectedStoredOutputFailure = {
  kind: 'unexpected',
  error: {
    tag: 'AppError',
    kind: 'InvariantViolationError',
    code: 'production_schedule_output_plan_invalid',
    message: 'Stored production schedule output plan is invalid.',
    safeMessage: 'Stored production scheduling state is inconsistent.',
    status: 500,
  },
} as const;

describe('production.load-schedule.v1 target conformance', () => {
  it.each(loadScheduleConformanceScenarios)('$name', async (scenario) => {
    const target = await observe(scenario, makeTarget);

    expect(loadScheduleOutcomeCode(target.outcome)).toBe(scenario.expectedCode);
    expect(target.after).toEqual(target.before);
    expect(target.calls).toEqual(['repository.select']);
    expect(target.clockReads).toBe(0);
    expect(target.idReads).toBe(0);

    expect(rows(target.before, 'locations')).toHaveLength(2);
    expect(rows(target.before, 'shifts')).toEqual([
      expect.objectContaining({
        id: ids.shift,
        locationId,
        version: 3,
        status: 'open',
      }),
    ]);
    expect(rows(target.before, 'selections')).toEqual([
      expect.objectContaining({
        productionShiftId: ids.shift,
        locationId,
        version: 7,
        selectedBy: ids.actor,
      }),
    ]);
    expect(rows(target.before, 'selectedOrders')).toEqual([]);
    expect(rows(target.before, 'configs')).toEqual([
      expect.objectContaining({
        id: ids.config,
        locationId,
        pulseMinutes: 42,
        version: 4,
      }),
    ]);
    expect(rows(target.before, 'workEvents')).toEqual([]);

    const storedSchedule = rows(target.before, 'schedules')[0];
    expect(storedSchedule).toMatchObject({
      id: ids.schedule,
      locationId,
      productionShiftId: ids.shift,
      schedulerConfigId: ids.config,
      status: 'accepted',
      inputSnapshot: {
        config: { id: ids.config, version: 4 },
        shift: { id: ids.shift, version: 3 },
        selection: {
          version: 7,
          orderIds: [ids.secondOrder, ids.firstOrder, ids.unplacedOrder],
        },
      },
    });

    if (scenario.expectedCode === 'success') {
      expect(target.outcome).toEqual({
        kind: 'success',
        value: loadScheduleExpectedProposal,
      });
      expect(
        target.outcome.kind === 'success'
          ? target.outcome.value.batches.map((batch) => batch.sequence)
          : [],
      ).toEqual([1, 0]);
      expect(
        target.outcome.kind === 'success'
          ? target.outcome.value.warnings.map((warning) => warning.code)
          : [],
      ).toEqual(['SHIFT_OVERFLOW', 'OVERSIZED_ORDER']);
      return;
    }

    if (
      scenario.input.locationId === siblingLocationId ||
      scenario.input.scheduleRunId === ids.missingSchedule
    ) {
      expect(target.outcome).toEqual(expectedNotFound);
      return;
    }

    expect(target.outcome).toEqual(expectedStoredOutputFailure);
  });
});
