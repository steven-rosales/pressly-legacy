import { schedulingProductionSystemDependencies } from './support/production-system-dependencies.ts';
import type { IdSource } from '@pressly/cells/id-source';
import {
  makeProductionSystem,
  type ProductionSystemSignals,
  type ProductionSystemUnitOfWorkObserver,
} from '@pressly/production-system/testing/assembly';
import type { StartScheduleCommand } from '@pressly/production-system/operations/scheduling/start-schedule/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  captureStartScheduleOutcome,
  startScheduleConformanceGeneratedIds as generatedIds,
  startScheduleConformanceIds as ids,
  startScheduleConformanceNow as now,
  startScheduleConformanceScenarios,
  startScheduleOutcomeCode,
  type CanonicalStartScheduleOutcome,
  type StartScheduleFixture,
  type StartScheduleScenario,
  type StartScheduleTransactionOutcome,
} from '../src/start-schedule-conformance.ts';
import {
  readStartScheduleConformanceState,
  removeStartScheduleConformanceFaults,
  resetStartScheduleConformance,
  seedStartScheduleConformance,
  startScheduleConformanceDatabase as database,
  startScheduleConformanceFaultDatabase as faultDatabase,
} from './support/start-schedule-conformance-fixture.ts';

type State = Awaited<ReturnType<typeof readStartScheduleConformanceState>>;

type Executor = Readonly<{
  execute: (command: StartScheduleCommand) => Promise<unknown>;
  clockReads: () => number;
  issuedIds: () => readonly string[];
  signalReads: readonly Promise<State>[];
  telemetry: readonly StartScheduleTransactionOutcome[];
}>;

type Observation = Readonly<{
  before: State;
  after: State;
  outcomes: readonly CanonicalStartScheduleOutcome[];
  signals: readonly State[];
  clockReads: number;
  issuedIds: readonly string[];
  telemetry: readonly StartScheduleTransactionOutcome[];
}>;

beforeAll(async () => {
  await database.check();
  await faultDatabase.check();
});
afterAll(async () => {
  await removeStartScheduleConformanceFaults();
  await faultDatabase.close();
  await database.close();
});

const trackedIds = () => {
  let index = 0;
  const issued: string[] = [];
  const source: IdSource = Object.freeze({
    next: () => {
      const value =
        generatedIds[index] ??
        `87999999-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      index += 1;
      issued.push(value);
      return value;
    },
  });
  return Object.freeze({ source, issued: () => Object.freeze([...issued]) });
};

const targetSignals = (
  reads: Promise<State>[],
  fixture: StartScheduleFixture,
): ProductionSystemSignals => ({
  runStarted: () => {
    reads.push(readStartScheduleConformanceState(database.db));
    if (fixture.signalFault === true)
      throw {
        kind: 'InvariantViolationError',
        code: 'start_schedule_signal_failed',
        status: 500,
        message: 'Start schedule signal failed.',
        safeMessage: 'Start schedule signal failed.',
      };
  },
});

const targetObserver =
  (
    telemetry: StartScheduleTransactionOutcome[],
  ): ProductionSystemUnitOfWorkObserver =>
  (operation, unitOfWork) => ({
    transaction: async (work) => {
      let outcome: StartScheduleTransactionOutcome = 'failed';
      try {
        const value = await unitOfWork.transaction(work);
        outcome = value.tag === 'ok' ? 'committed' : 'expected_rollback';
        return value;
      } finally {
        if (operation === 'production.start_schedule') telemetry.push(outcome);
      }
    },
  });

const makeExecutor = (fixture: StartScheduleFixture): Executor => {
  const identifiers = trackedIds();
  const signalReads: Promise<State>[] = [];
  const telemetry: StartScheduleTransactionOutcome[] = [];
  let clockReads = 0;
  const clock = {
    now: () => {
      clockReads += 1;
      return new Date(now);
    },
  };
  const execute = makeProductionSystem({
    ...schedulingProductionSystemDependencies(),

    db: database.db,
    ids: identifiers.source,
    clock,
    signals: targetSignals(signalReads, fixture),
    observeCellUnitOfWork: targetObserver(telemetry),
  }).cells.startSchedule.execute;
  return Object.freeze({
    execute,
    clockReads: () => clockReads,
    issuedIds: identifiers.issued,
    signalReads,
    telemetry,
  });
};

const runTarget = async (
  scenario: StartScheduleScenario,
): Promise<Observation> => {
  await resetStartScheduleConformance();
  await seedStartScheduleConformance(database.db, scenario.fixture);
  const before = await readStartScheduleConformanceState(database.db);
  const executors =
    scenario.separateExecutors === true
      ? scenario.commands.map(() => makeExecutor(scenario.fixture))
      : [makeExecutor(scenario.fixture)];
  const outcomes: CanonicalStartScheduleOutcome[] = [];
  try {
    if (scenario.executionMode === 'concurrent') {
      const [first, ...remaining] = scenario.commands;
      if (first !== undefined) {
        const firstOutcome = captureStartScheduleOutcome(
          executors[0]!.execute,
          first,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
        const later = remaining.map((command, index) =>
          captureStartScheduleOutcome(
            executors[index + 1]?.execute ?? executors[0]!.execute,
            command,
          ),
        );
        outcomes.push(...(await Promise.all([firstOutcome, ...later])));
      }
    } else {
      for (const [index, command] of scenario.commands.entries())
        outcomes.push(
          await captureStartScheduleOutcome(
            executors[index]?.execute ?? executors[0]!.execute,
            command,
          ),
        );
    }
    return Object.freeze({
      before,
      after: await readStartScheduleConformanceState(database.db),
      outcomes: Object.freeze(outcomes),
      signals: Object.freeze(
        await Promise.all(
          executors.flatMap((executor) => executor.signalReads),
        ),
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
  } finally {
    await removeStartScheduleConformanceFaults();
  }
};

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          key !== 'createdAt' && key !== 'updatedAt' && key !== 'publishedAt',
      )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
};

const sorted = (values: readonly string[]): string[] => [...values].sort();

const expectedTelemetry = (
  fixture: StartScheduleFixture,
  outcomes: readonly CanonicalStartScheduleOutcome[],
): readonly StartScheduleTransactionOutcome[] =>
  outcomes.map((outcome) => {
    if (outcome.kind === 'success') return 'committed';
    if (outcome.kind === 'unexpected')
      return fixture.signalFault === true ? 'committed' : 'failed';
    return 'expected_rollback';
  });

const liveRevision = (state: State): number =>
  state.locations.reduce((total, location) => total + location.liveRevision, 0);

const assertFullGraph = (
  scenario: StartScheduleScenario,
  observation: Observation,
): void => {
  const fresh = observation.outcomes.some(
    (outcome) => outcome.kind === 'success' && !outcome.value.replayed,
  );
  if (!fresh && scenario.fixture.signalFault !== true) {
    expect(canonicalize(observation.after)).toEqual(
      canonicalize(observation.before),
    );
    return;
  }
  if (!fresh) return;
  expect(observation.after.runs).toHaveLength(1);
  expect(observation.after.batches).toHaveLength(2);
  expect(observation.after.memberships).toHaveLength(2);
  expect(observation.after.stages).toHaveLength(8);
  expect(observation.after.assignments).toHaveLength(4);
  expect(observation.after.attempts).toHaveLength(8);
  expect(
    observation.after.productionOrders.map((order) => [
      order.id,
      order.operationalStatus,
      order.executionStatus,
      order.version,
    ]),
  ).toEqual([
    [ids.orderA, 'scheduled', 'scheduled', 2],
    [ids.orderB, 'scheduled', 'scheduled', 2],
  ]);
  expect(
    observation.after.batches.map((batch) => [
      batch.id,
      batch.sequenceIndex,
      batch.status,
    ]),
  ).toEqual([
    [generatedIds[1], 0, 'queued'],
    [generatedIds[8], 1, 'queued'],
  ]);
  expect(observation.after.stages.map((stage) => stage.id).sort()).toEqual(
    [
      generatedIds[2],
      generatedIds[3],
      generatedIds[5],
      generatedIds[7],
      generatedIds[9],
      generatedIds[10],
      generatedIds[12],
      generatedIds[14],
    ].sort(),
  );
  expect(
    observation.after.assignments.map((assignment) => [
      assignment.id,
      assignment.stageRunId,
      assignment.machineId,
    ]),
  ).toEqual([
    [generatedIds[4], generatedIds[3], ids.washer],
    [generatedIds[6], generatedIds[5], ids.dryer],
    [generatedIds[11], generatedIds[10], ids.washer],
    [generatedIds[13], generatedIds[12], ids.dryer],
  ]);
  expect(
    observation.after.attempts.map((attempt) => [
      attempt.id,
      attempt.stageRunId,
      attempt.productionOrderId,
    ]),
  ).toEqual([
    [generatedIds[15], generatedIds[2], ids.orderA],
    [generatedIds[16], generatedIds[3], ids.orderA],
    [generatedIds[17], generatedIds[5], ids.orderA],
    [generatedIds[18], generatedIds[7], ids.orderA],
    [generatedIds[19], generatedIds[9], ids.orderB],
    [generatedIds[20], generatedIds[10], ids.orderB],
    [generatedIds[21], generatedIds[12], ids.orderB],
    [generatedIds[22], generatedIds[14], ids.orderB],
  ]);
  expect(
    observation.after.attempts.every(
      (attempt) =>
        attempt.status === 'assigned' &&
        attempt.attemptNumber === 1 &&
        attempt.assignmentReason === 'initial_schedule',
    ),
  ).toBe(true);
  const event = observation.after.workEvents.find(
    (candidate) => candidate.eventType === 'production_run_started',
  );
  expect(event).toMatchObject({
    id: generatedIds[23],
    entityType: 'production_run',
    idempotencyKey: scenario.commands[0]?.idempotencyKey,
    payload: expect.objectContaining({
      productionRunId: generatedIds[0],
      productionBatchIds: [generatedIds[1], generatedIds[8]],
      queueVersion: 1,
      _idempotency: expect.objectContaining({ version: 1 }),
    }),
  });
  expect(
    liveRevision(observation.after) - liveRevision(observation.before),
  ).toBe(1);
};

describe('production.start-schedule.v1 target PostgreSQL conformance', () => {
  it.each(startScheduleConformanceScenarios)('$name', async (scenario) => {
    const target = await runTarget(scenario);

    const targetCodes = target.outcomes.map(startScheduleOutcomeCode);
    expect(
      scenario.executionMode === 'concurrent'
        ? sorted(targetCodes)
        : targetCodes,
    ).toEqual(
      scenario.executionMode === 'concurrent'
        ? sorted(scenario.expectedOutcomeCodes)
        : scenario.expectedOutcomeCodes,
    );
    expect(target.clockReads).toBe(scenario.expectedClockReads);
    expect(target.signals).toHaveLength(scenario.expectedSignalCount);
    expect(target.issuedIds).toHaveLength(scenario.expectedIssuedIdCount);
    expect(
      scenario.executionMode === 'concurrent'
        ? sorted(target.telemetry)
        : target.telemetry,
    ).toEqual(
      scenario.executionMode === 'concurrent'
        ? sorted(expectedTelemetry(scenario.fixture, target.outcomes))
        : expectedTelemetry(scenario.fixture, target.outcomes),
    );
    for (const signaledState of target.signals)
      expect(canonicalize(signaledState)).toEqual(canonicalize(target.after));
    assertFullGraph(scenario, target);

    if (typeof scenario.fixture.acceptedBy === 'string')
      expect(target.after.runs[0]?.overtimeAcknowledgedBy).toBe(
        scenario.fixture.acceptedBy,
      );
  });
});
