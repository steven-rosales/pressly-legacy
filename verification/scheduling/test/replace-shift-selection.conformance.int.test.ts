import type { IdSource } from '@pressly/cells/id-source';
import { makeReplaceShiftSelectionCell } from '@pressly/production-system/operations/scheduling/replace-shift-selection/cell';
import { makeReplaceShiftSelectionPostgresRepository } from '@pressly/production-system/operations/scheduling/replace-shift-selection/postgres';
import { replaceShiftSelectionIdempotency } from '@pressly/production-system/operations/scheduling/replace-shift-selection/idempotency';
import type { ProductionResultUnitOfWorkObserver } from '@pressly/production-system/testing/result-unit-of-work-observer';
import type { ReplaceShiftSelectionCommand } from '@pressly/production-system/operations/scheduling/replace-shift-selection/types';
import { productionRules } from '@pressly/production-system/model';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schedulingProductionSchema } from './support/production-system-dependencies.ts';
import {
  captureReplaceShiftSelectionOutcome,
  replaceShiftSelectionConformanceIds as ids,
  replaceShiftSelectionConformanceNow as now,
  replaceShiftSelectionConformanceScenarios,
  replaceShiftSelectionOutcomeCode,
  type CanonicalReplaceShiftSelectionOutcome,
  type ReplaceShiftSelectionFixture,
  type ReplaceShiftSelectionScenario,
  type ReplaceShiftSelectionTransactionOutcome,
} from '../src/replace-shift-selection-conformance.ts';
import {
  readReplaceShiftSelectionConformanceState,
  replaceShiftSelectionConformanceDatabase,
  resetReplaceShiftSelectionConformanceDatabase,
  seedReplaceShiftSelectionConformance,
} from './support/replace-shift-selection-conformance-fixture.ts';

const runtime = replaceShiftSelectionConformanceDatabase();
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

const trackedIds = (index: number) => {
  const values =
    index === 0 ? [ids.eventA, ids.eventB] : [ids.eventB, ids.eventA];
  const issued: string[] = [];
  const source: IdSource = Object.freeze({
    next: () => {
      const value =
        values[issued.length] ??
        `93000000-0000-4000-8000-${String(issued.length + 1).padStart(12, '0')}`;
      issued.push(value);
      return value;
    },
  });
  return Object.freeze({ source, issued: () => Object.freeze([...issued]) });
};

type State = Awaited<
  ReturnType<typeof readReplaceShiftSelectionConformanceState>
>;

type Executor = Readonly<{
  execute: (command: ReplaceShiftSelectionCommand) => Promise<unknown>;
  clockReads: () => number;
  issuedIds: () => readonly string[];
  signalReads: readonly Promise<State>[];
  telemetry: readonly ReplaceShiftSelectionTransactionOutcome[];
}>;

const planSuperseded =
  (fixture: ReplaceShiftSelectionFixture, reads: Promise<State>[]) => () => {
    reads.push(readReplaceShiftSelectionConformanceState(database.db));
    if (fixture.signalFault === true) throw { signal: 'failed' };
  };

const makeExecutor = (
  fixture: ReplaceShiftSelectionFixture,
  index: number,
): Executor => {
  const clock = trackedClock();
  const identifiers = trackedIds(index);
  const signalReads: Promise<State>[] = [];
  const telemetry: ReplaceShiftSelectionTransactionOutcome[] = [];
  const observeUnitOfWork: ProductionResultUnitOfWorkObserver = (
    unitOfWork,
  ) => ({
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
  const cell = makeReplaceShiftSelectionCell({
    repo: makeReplaceShiftSelectionPostgresRepository(
      {
        db: database.db,
        ids: identifiers.source,
        observeUnitOfWork,
      },
      schedulingProductionSchema,
    ),
    idempotency: replaceShiftSelectionIdempotency,
    policy: productionRules,
    clock: clock.clock,
    signals: { planSuperseded: planSuperseded(fixture, signalReads) },
  });
  return Object.freeze({
    execute: cell.execute,
    clockReads: clock.reads,
    issuedIds: identifiers.issued,
    signalReads,
    telemetry,
  });
};

type Observation = Readonly<{
  before: State;
  after: State;
  outcomes: readonly CanonicalReplaceShiftSelectionOutcome[];
  signals: readonly State[];
  clockReads: number;
  issuedIds: readonly string[];
  telemetry: readonly ReplaceShiftSelectionTransactionOutcome[];
}>;

const capture = (
  executor: Executor,
  command: ReplaceShiftSelectionCommand,
): Promise<CanonicalReplaceShiftSelectionOutcome> =>
  captureReplaceShiftSelectionOutcome(executor.execute, command);

const runConformanceScenario = async (
  scenario: ReplaceShiftSelectionScenario,
): Promise<Observation> => {
  await resetReplaceShiftSelectionConformanceDatabase(database);
  await seedReplaceShiftSelectionConformance(database.db, scenario);
  const before = await readReplaceShiftSelectionConformanceState(database.db);
  const executors = scenario.commands.map((_, index) =>
    makeExecutor(scenario.fixture, index),
  );
  const outcomes: CanonicalReplaceShiftSelectionOutcome[] = [];

  if (scenario.executionMode === 'concurrent') {
    const [first, ...remaining] = scenario.commands;
    if (first !== undefined) {
      const firstOutcome = capture(executors[0]!, first);
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
      const later = remaining.map((command, index) =>
        capture(executors[index + 1]!, command),
      );
      outcomes.push(...(await Promise.all([firstOutcome, ...later])));
    }
  } else {
    for (const [index, command] of scenario.commands.entries())
      outcomes.push(await capture(executors[index]!, command));
  }

  return Object.freeze({
    before,
    after: await readReplaceShiftSelectionConformanceState(database.db),
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
  scenario: ReplaceShiftSelectionScenario,
  outcomes: readonly CanonicalReplaceShiftSelectionOutcome[],
): readonly ReplaceShiftSelectionTransactionOutcome[] =>
  outcomes.map((outcome) => {
    if (outcome.kind === 'success') return 'committed';
    if (outcome.kind === 'failure') return 'expected_rollback';
    return scenario.fixture.signalFault === true ? 'committed' : 'failed';
  });

const newEvents = (observation: Observation) => {
  const beforeIds = new Set(observation.before.workEvents.map(({ id }) => id));
  return observation.after.workEvents.filter(({ id }) => !beforeIds.has(id));
};

const receipt = (event: State['workEvents'][number]) => {
  const payload =
    typeof event.payload === 'object' && event.payload !== null
      ? (event.payload as Record<string, unknown>)
      : {};
  return payload['_idempotency'];
};

describe('production.replace-shift-selection.v1 public PostgreSQL conformance', () => {
  it.each(replaceShiftSelectionConformanceScenarios)(
    '$name',
    async (scenario) => {
      const target = await runConformanceScenario(scenario);

      const codes = target.outcomes.map(replaceShiftSelectionOutcomeCode);
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
        expect(event.eventType).toBe('production_shift_selection_replaced');
        expect(receipt(event)).toMatchObject({ version: 1 });
      }
      const revisionDelta =
        (target.after.locations[0]?.liveRevision ?? 0) -
        (target.before.locations[0]?.liveRevision ?? 0);
      expect(revisionDelta).toBe(newEvents(target).length);

      if (scenario.fixture.currentSchedule === 'rejected') {
        expect(target.after.schedules).toEqual(target.before.schedules);
        expect(target.signals).toEqual([]);
      }
      if (scenario.fixture.signalFault === true) {
        expect(target.after.schedules[0]).toMatchObject({
          status: 'superseded',
        });
        expect(target.signals).toHaveLength(1);
      }
    },
  );
});
