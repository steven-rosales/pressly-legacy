import { schedulingProductionSystemDependencies } from './support/production-system-dependencies.ts';
import type { IdSource } from '@pressly/cells/id-source';
import {
  makeProductionSystem,
  type ProductionSystemUnitOfWorkObserver,
} from '@pressly/production-system/testing/assembly';
import type { CreateScheduleCommand } from '@pressly/production-system/operations/scheduling/create-schedule/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  captureCreateScheduleOutcome,
  createScheduleConformanceIds as ids,
  createScheduleConformanceNow as now,
  createScheduleConformanceScenarios,
  createScheduleOutcomeCode,
  type CanonicalCreateScheduleOutcome,
  type CreateScheduleFixture,
  type CreateScheduleScenario,
  type CreateScheduleTransactionOutcome,
} from '../src/create-schedule-conformance.ts';
import {
  createScheduleConformanceDatabase,
  readCreateScheduleConformanceState,
  replaceCreateScheduleSelection,
  resetCreateScheduleConformanceDatabase,
  seedCreateScheduleConformance,
  type CreateScheduleConformanceDatabase,
} from './support/create-schedule-conformance-fixture.ts';

const runtime = createScheduleConformanceDatabase();
const database = runtime.database;

beforeAll(runtime.setup, 180_000);
afterAll(async () => {
  expect(await runtime.closeForceDropAndVerifyAbsent()).toBe(false);
}, 30_000);

const trackedClock = () => {
  let reads = 0;
  return Object.freeze({
    clock: Object.freeze({
      now: () => {
        reads += 1;
        return new Date(now);
      },
    }),
    reads: () => reads,
  });
};

const trackedIds = (fixture: CreateScheduleFixture, index: number) => {
  const values =
    fixture.fault === 'schedule_id_collision'
      ? [ids.currentSchedule, ids.eventA]
      : index === 0
        ? [ids.scheduleA, ids.eventA, ids.scheduleB, ids.eventB]
        : [ids.secondSchedule, ids.secondEvent];
  const issued: string[] = [];
  const source: IdSource = Object.freeze({
    next: () => {
      const value =
        values[issued.length] ??
        `92000000-0000-4000-8000-${String(issued.length + 1).padStart(12, '0')}`;
      issued.push(value);
      return value;
    },
  });
  return Object.freeze({ source, issued: () => Object.freeze([...issued]) });
};

type State = Awaited<ReturnType<typeof readCreateScheduleConformanceState>>;

type Executor = Readonly<{
  execute: (command: CreateScheduleCommand) => Promise<unknown>;
  clockReads: () => number;
  issuedIds: () => readonly string[];
  signalReads: readonly Promise<State>[];
  telemetry: readonly CreateScheduleTransactionOutcome[];
}>;

const signalPort = (
  database: CreateScheduleConformanceDatabase,
  fixture: CreateScheduleFixture,
  reads: Promise<State>[],
): Readonly<{ planSuperseded: () => void }> => ({
  planSuperseded: () => {
    reads.push(readCreateScheduleConformanceState(database.db));
    if (fixture.signalFault === true) throw { signal: 'failed' };
  },
});

const makeExecutor = (
  database: CreateScheduleConformanceDatabase,
  fixture: CreateScheduleFixture,
  index: number,
): Executor => {
  const clock = trackedClock();
  const identifiers = trackedIds(fixture, index);
  const signalReads: Promise<State>[] = [];
  const telemetry: CreateScheduleTransactionOutcome[] = [];
  const observeCellUnitOfWork: ProductionSystemUnitOfWorkObserver = (
    operation,
    unitOfWork,
  ) => {
    if (operation !== 'production.create_schedule') return unitOfWork;
    return Object.freeze({
      transaction: async (work) => {
        try {
          const outcome = await unitOfWork.transaction(work);
          telemetry.push(
            outcome.tag === 'ok' ? 'committed' : 'expected_rollback',
          );
          return outcome;
        } catch (error) {
          telemetry.push('failed');
          throw error;
        }
      },
    });
  };
  const system = makeProductionSystem({
    ...schedulingProductionSystemDependencies(),

    db: database.db,
    ids: identifiers.source,
    clock: clock.clock,
    signals: {
      planSuperseded: signalPort(database, fixture, signalReads).planSuperseded,
    },
    observeCellUnitOfWork,
  });
  return Object.freeze({
    execute: system.cells.createSchedule.execute,
    clockReads: clock.reads,
    issuedIds: identifiers.issued,
    signalReads,
    telemetry,
  });
};

type Observation = Readonly<{
  before: State;
  after: State;
  outcomes: readonly CanonicalCreateScheduleOutcome[];
  signals: readonly State[];
  clockReads: number;
  issuedIds: readonly string[];
  telemetry: readonly CreateScheduleTransactionOutcome[];
}>;

const capture = (
  executor: Executor,
  command: CreateScheduleCommand,
): Promise<CanonicalCreateScheduleOutcome> =>
  captureCreateScheduleOutcome(executor.execute, command);

const runConformanceScenario = async (
  scenario: CreateScheduleScenario,
): Promise<Observation> => {
  await resetCreateScheduleConformanceDatabase(database);
  await seedCreateScheduleConformance(database.db, scenario);
  const before = await readCreateScheduleConformanceState(database.db);
  const executors =
    scenario.separateExecutors === true
      ? scenario.commands.map((_, index) =>
          makeExecutor(database, scenario.fixture, index),
        )
      : [makeExecutor(database, scenario.fixture, 0)];
  const outcomes: CanonicalCreateScheduleOutcome[] = [];

  if (scenario.executionMode === 'concurrent') {
    const [first, ...remaining] = scenario.commands;
    if (first !== undefined) {
      const firstOutcome = capture(executors[0]!, first);
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
      const laterOutcomes = remaining.map((command, index) =>
        capture(executors[index + 1] ?? executors[0]!, command),
      );
      outcomes.push(...(await Promise.all([firstOutcome, ...laterOutcomes])));
    }
  } else {
    for (const [index, command] of scenario.commands.entries()) {
      if (index > 0 && scenario.betweenCommands === 'replace_selection')
        await replaceCreateScheduleSelection(database.db);
      outcomes.push(await capture(executors[index] ?? executors[0]!, command));
    }
  }

  return Object.freeze({
    before,
    after: await readCreateScheduleConformanceState(database.db),
    outcomes: Object.freeze(outcomes),
    signals: Object.freeze(
      await Promise.all(executors.flatMap((executor) => executor.signalReads)),
    ),
    clockReads: executors.reduce(
      (total, executor) => total + executor.clockReads(),
      0,
    ),
    issuedIds: Object.freeze(
      executors.flatMap((executor) => executor.issuedIds()),
    ),
    telemetry: Object.freeze(
      executors.flatMap((executor) => executor.telemetry),
    ),
  });
};

const sorted = <Value extends string>(values: readonly Value[]): Value[] =>
  [...values].sort();

const expectedTelemetry = (
  scenario: CreateScheduleScenario,
  outcomes: readonly CanonicalCreateScheduleOutcome[],
): readonly CreateScheduleTransactionOutcome[] =>
  outcomes.map((outcome) => {
    if (outcome.kind === 'success') return 'committed';
    if (outcome.kind === 'failure') return 'expected_rollback';
    return scenario.fixture.signalFault === true ? 'committed' : 'failed';
  });

const newEvents = (observation: Observation) => {
  const before = new Set(
    observation.before.workEvents.map((event) => event.id),
  );
  return observation.after.workEvents.filter((event) => !before.has(event.id));
};

const receipt = (event: State['workEvents'][number]) => {
  const payload =
    typeof event.payload === 'object' && event.payload !== null
      ? (event.payload as Record<string, unknown>)
      : {};
  return payload['_idempotency'];
};

describe('production.create-schedule.v1 public PostgreSQL conformance', () => {
  it.each(createScheduleConformanceScenarios)('$name', async (scenario) => {
    const target = await runConformanceScenario(scenario);

    const codes = target.outcomes.map(createScheduleOutcomeCode);
    expect(
      scenario.executionMode === 'concurrent' ? sorted(codes) : codes,
    ).toEqual(
      scenario.executionMode === 'concurrent'
        ? sorted(scenario.expectedOutcomeCodes)
        : scenario.expectedOutcomeCodes,
    );
    expect(sorted(target.telemetry)).toEqual(
      sorted(expectedTelemetry(scenario, target.outcomes)),
    );

    for (const event of newEvents(target)) {
      expect(event.eventType).toBe('schedule_computed');
      expect(receipt(event)).toMatchObject({ version: 1 });
    }
    const revisionDelta = target.after.locations.reduce(
      (total, location) =>
        total +
        location.liveRevision -
        (target.before.locations.find((row) => row.id === location.id)
          ?.liveRevision ?? 0),
      0,
    );
    expect(revisionDelta).toBe(newEvents(target).length);

    if (scenario.betweenCommands === 'replace_selection') {
      expect(target.outcomes[1]).toEqual(target.outcomes[0]);
      expect(target.after.schedules).toHaveLength(1);
      expect(
        target.after.selectedOrders.map((row) => row.productionOrderId),
      ).toEqual([ids.secondProductionOrder]);
    }
    if (scenario.fixture.signalFault === true) {
      expect(target.after.schedules.map((row) => row.status).sort()).toEqual(
        ['superseded', 'draft'].sort(),
      );
      expect(target.signals).toHaveLength(1);
    }
  });
});
