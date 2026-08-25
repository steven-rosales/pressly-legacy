import { schedulingProductionSystemDependencies } from './support/production-system-dependencies.ts';
import type { IdSource } from '@pressly/cells/id-source';
import {
  makeProductionSystem,
  type ProductionSystemSignals,
  type ProductionSystemUnitOfWorkObserver,
} from '@pressly/production-system/testing/assembly';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  capturePlacementOutcome,
  makeAttemptPlacementCommand,
  makeAutomaticPlacementCommand,
  makeConfirmOvertimeCommand,
  makeExactPlacementCommand,
  placementConformanceIds as ids,
  placementConformanceNow as now,
  placementConformanceScenarios,
  placementOutcomeCode,
  type AutomaticPlacementCommand,
  type CanonicalPlacementOutcome,
  type ConfirmOvertimeCommand,
  type ExactPlacementCommand,
  type PlacementConformanceScenario,
} from '../src/placement-bundle-conformance.ts';
import {
  createPlacementConformanceDatabase,
  driftPlacementQueue,
  installPlacementReceiptDelay,
  readPlacementConformanceState,
  resetPlacementConformanceDatabase,
  seedPlacementConformance,
  type PlacementConformanceDatabase,
} from './support/placement-bundle-conformance-fixture.ts';

const runtime = createPlacementConformanceDatabase();
const database = runtime.database;

beforeAll(runtime.setup, 180_000);
afterAll(async () => {
  expect(await runtime.closeForceDropAndVerifyAbsent()).toBe(false);
}, 30_000);

type PlacementState = Awaited<ReturnType<typeof readPlacementConformanceState>>;
type TransactionOutcome = 'committed' | 'expected_rollback' | 'failed';
type PlacementSignal = Readonly<{
  kind: 'placement_outcome' | 'queue_conflict' | 'overtime_confirmed';
  input: unknown;
  state: PlacementState;
}>;

type PlacementExecutor = Readonly<{
  attempt: (
    command: ReturnType<typeof makeAttemptPlacementCommand>,
  ) => Promise<unknown>;
  automatic: (command: AutomaticPlacementCommand) => Promise<unknown>;
  exact: (command: ExactPlacementCommand) => Promise<unknown>;
  confirm: (command: ConfirmOvertimeCommand) => Promise<unknown>;
  clockReads: () => number;
  issuedIds: () => readonly string[];
  signalReads: readonly Promise<PlacementSignal>[];
  telemetry: readonly TransactionOutcome[];
}>;

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

const trackedIds = () => {
  const issued: string[] = [];
  const source: IdSource = Object.freeze({
    next: () => {
      const value = `76000000-0000-4000-8000-${String(issued.length + 1).padStart(12, '0')}`;
      issued.push(value);
      return value;
    },
  });
  return Object.freeze({ source, issued: () => Object.freeze([...issued]) });
};

const signalRecorder = (
  database: PlacementConformanceDatabase,
  scenario: PlacementConformanceScenario,
  reads: Promise<PlacementSignal>[],
) => {
  const capture = (kind: PlacementSignal['kind'], input: unknown): void => {
    reads.push(
      readPlacementConformanceState(database.db).then((state) => ({
        kind,
        input,
        state,
      })),
    );
    if (scenario.fixture.signalFault === true)
      throw { placementSignal: 'failed' };
  };
  return Object.freeze({
    placementOutcome: (input: unknown) => capture('placement_outcome', input),
    queueConflict: (input: unknown) => capture('queue_conflict', input),
    overtimeConfirmed: () => capture('overtime_confirmed', null),
  });
};

const targetSignals = (
  recorder: ReturnType<typeof signalRecorder>,
): ProductionSystemSignals => ({
  placementOutcome: recorder.placementOutcome,
  queueConflict: recorder.queueConflict,
  overtimeConfirmed: recorder.overtimeConfirmed,
});

const makeTargetExecutor = (
  database: PlacementConformanceDatabase,
  scenario: PlacementConformanceScenario,
): PlacementExecutor => {
  const clock = trackedClock();
  const identifiers = trackedIds();
  const signalReads: Promise<PlacementSignal>[] = [];
  const recorder = signalRecorder(database, scenario, signalReads);
  const telemetry: TransactionOutcome[] = [];
  const observeCellUnitOfWork: ProductionSystemUnitOfWorkObserver = (
    operation,
    unitOfWork,
  ) => {
    if (
      operation !== 'production.attempt_automatic_placement' &&
      operation !== 'production.place_order_automatically' &&
      operation !== 'production.place_order_exactly' &&
      operation !== 'production.confirm_order_overtime'
    )
      return unitOfWork;
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
    signals: targetSignals(recorder),
    observeCellUnitOfWork,
  });
  return Object.freeze({
    attempt: system.cells.attemptAutomaticPlacement.execute,
    automatic: system.cells.placeOrderAutomatically.execute,
    exact: system.cells.placeOrderExactly.execute,
    confirm: system.cells.confirmOrderOvertime.execute,
    clockReads: clock.reads,
    issuedIds: identifiers.issued,
    signalReads,
    telemetry,
  });
};

const proposalHash = (outcome: CanonicalPlacementOutcome): string => {
  if (
    outcome.kind !== 'success' ||
    typeof outcome.value !== 'object' ||
    outcome.value === null ||
    !('proposalHash' in outcome.value) ||
    typeof outcome.value.proposalHash !== 'string'
  )
    throw new Error('Overtime setup did not return a proposal hash.');
  return outcome.value.proposalHash;
};

const concurrently = async (
  first: () => Promise<CanonicalPlacementOutcome>,
  second: () => Promise<CanonicalPlacementOutcome>,
): Promise<readonly CanonicalPlacementOutcome[]> => {
  const firstOutcome = first();
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  return Promise.all([firstOutcome, second()]);
};

const executeFlow = async (
  database: PlacementConformanceDatabase,
  executor: PlacementExecutor,
  scenario: PlacementConformanceScenario,
): Promise<readonly CanonicalPlacementOutcome[]> => {
  const staleQueue = scenario.fixture.command === 'stale_queue';
  const staleBatch = scenario.fixture.command === 'stale_batch';
  const automatic = makeAutomaticPlacementCommand({
    expectedQueueVersion: staleQueue ? 0 : 1,
  });
  const exact = makeExactPlacementCommand({
    expectedBatchVersion: staleBatch
      ? 99
      : scenario.fixture.mutableBatch === 'frozen'
        ? 2
        : 1,
  });
  const capture = (run: () => Promise<unknown>) => capturePlacementOutcome(run);
  switch (scenario.flow) {
    case 'attempt_once':
      return [
        await capture(() => executor.attempt(makeAttemptPlacementCommand())),
      ];
    case 'attempt_twice': {
      const command = makeAttemptPlacementCommand();
      return [
        await capture(() => executor.attempt(command)),
        await capture(() => executor.attempt(command)),
      ];
    }
    case 'attempt_divergent_same_key': {
      const command = makeAttemptPlacementCommand();
      return [
        await capture(() => executor.attempt(command)),
        await capture(() =>
          executor.attempt({ ...command, actorId: ids.otherActor }),
        ),
      ];
    }
    case 'automatic_once':
      return [await capture(() => executor.automatic(automatic))];
    case 'automatic_replay_divergence':
      return [
        await capture(() => executor.automatic(automatic)),
        await capture(() => executor.automatic(automatic)),
        await capture(() =>
          executor.automatic({ ...automatic, actorId: ids.otherActor }),
        ),
      ];
    case 'automatic_confirmation_replay':
      return [
        await capture(() => executor.automatic(automatic)),
        await capture(() => executor.automatic(automatic)),
      ];
    case 'automatic_same_key_race':
      return concurrently(
        () => capture(() => executor.automatic(automatic)),
        () => capture(() => executor.automatic(automatic)),
      );
    case 'automatic_different_key_race':
      return concurrently(
        () => capture(() => executor.automatic(automatic)),
        () =>
          capture(() =>
            executor.automatic({
              ...automatic,
              productionOrderId: ids.orderB,
              idempotencyKey: 'placement-automatic-2',
            }),
          ),
      );
    case 'exact_once':
      return [await capture(() => executor.exact(exact))];
    case 'exact_replay_divergence':
      return [
        await capture(() => executor.exact(exact)),
        await capture(() => executor.exact(exact)),
        await capture(() =>
          executor.exact({ ...exact, actorId: ids.otherActor }),
        ),
      ];
    case 'exact_same_key_race':
      return concurrently(
        () => capture(() => executor.exact(exact)),
        () => capture(() => executor.exact(exact)),
      );
    case 'exact_different_key_race':
      return concurrently(
        () => capture(() => executor.exact(exact)),
        () =>
          capture(() =>
            executor.exact({
              ...exact,
              productionOrderId: ids.orderB,
              idempotencyKey: 'placement-exact-2',
            }),
          ),
      );
    case 'automatic_overtime_confirm':
    case 'automatic_overtime_confirm_replay':
    case 'automatic_overtime_stale': {
      const initial = await capture(() => executor.automatic(automatic));
      const confirm = makeConfirmOvertimeCommand(proposalHash(initial));
      if (scenario.flow === 'automatic_overtime_stale')
        await driftPlacementQueue(database.db);
      const confirmed = await capture(() => executor.confirm(confirm));
      if (scenario.flow !== 'automatic_overtime_confirm_replay')
        return [initial, confirmed];
      return [
        initial,
        confirmed,
        await capture(() => executor.confirm(confirm)),
      ];
    }
    case 'exact_overtime_confirm': {
      const initial = await capture(() => executor.exact(exact));
      return [
        initial,
        await capture(() =>
          executor.confirm(makeConfirmOvertimeCommand(proposalHash(initial))),
        ),
      ];
    }
  }
};

type PlacementObservation = Readonly<{
  before: PlacementState;
  after: PlacementState;
  outcomes: readonly CanonicalPlacementOutcome[];
  signals: readonly PlacementSignal[];
  clockReads: number;
  issuedIds: readonly string[];
  telemetry: readonly TransactionOutcome[];
}>;

const runScenario = async (
  scenario: PlacementConformanceScenario,
): Promise<PlacementObservation> => {
  await resetPlacementConformanceDatabase(database);
  await seedPlacementConformance(database.db, scenario.fixture);
  if (
    scenario.flow === 'automatic_same_key_race' ||
    scenario.flow === 'exact_same_key_race'
  )
    await installPlacementReceiptDelay(database.db);
  const before = await readPlacementConformanceState(database.db);
  const executor = makeTargetExecutor(database, scenario);
  const outcomes = await executeFlow(database, executor, scenario);
  return Object.freeze({
    before,
    after: await readPlacementConformanceState(database.db),
    outcomes,
    signals: Object.freeze(await Promise.all(executor.signalReads)),
    clockReads: executor.clockReads(),
    issuedIds: executor.issuedIds(),
    telemetry: Object.freeze([...executor.telemetry]),
  });
};

const sorted = <Value extends string>(values: readonly Value[]): Value[] =>
  [...values].sort();

const outcomeCodes = (
  scenario: PlacementConformanceScenario,
  outcomes: readonly CanonicalPlacementOutcome[],
): readonly string[] => {
  const codes = outcomes.map(placementOutcomeCode);
  return scenario.normalizeOutcomeOrder === true ? sorted(codes) : codes;
};

const expectedTargetTelemetry = (
  outcomes: readonly CanonicalPlacementOutcome[],
): readonly TransactionOutcome[] =>
  outcomes.map((outcome) => {
    if (outcome.kind === 'failure') return 'expected_rollback';
    if (outcome.kind === 'unexpected' && outcome.error.code !== 'unknown_error')
      return 'failed';
    return 'committed';
  });

const expectedIssuedIdCount = (
  scenario: PlacementConformanceScenario,
): number => {
  switch (scenario.flow) {
    case 'attempt_once':
      return (scenario.fixture.runCount ?? 1) === 1 ? 7 : 1;
    case 'attempt_twice':
      return 7;
    case 'attempt_divergent_same_key':
      return 1;
    case 'automatic_once':
      if (scenario.fixture.fault === 'stage_cas') return 0;
      if (
        scenario.fixture.fault === 'order_cas' ||
        scenario.fixture.fault === 'run_cas'
      )
        return 6;
      if (scenario.fixture.fault === 'event_append') return 7;
      if (scenario.fixture.mutableBatch === 'frozen') return 12;
      if (
        (scenario.fixture.arrivingWeightLbs ?? 20) > 100 ||
        scenario.fixture.command === 'stale_queue'
      )
        return 1;
      return 7;
    case 'automatic_replay_divergence':
    case 'automatic_same_key_race':
    case 'exact_replay_divergence':
    case 'exact_same_key_race':
      return 7;
    case 'automatic_confirmation_replay':
      return 1;
    case 'automatic_different_key_race':
    case 'exact_different_key_race':
      return 8;
    case 'exact_once':
      return scenario.fixture.command === 'stale_batch' ||
        scenario.fixture.mutableBatch === 'frozen'
        ? 1
        : 7;
    case 'automatic_overtime_confirm':
    case 'automatic_overtime_confirm_replay':
    case 'exact_overtime_confirm':
      return 8;
    case 'automatic_overtime_stale':
      return 2;
  }
};

const expectedIssuedIds = (count: number): readonly string[] =>
  Array.from(
    { length: count },
    (_, index) =>
      `76000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  );

describe('Production placement bundle public PostgreSQL conformance', () => {
  it.each(placementConformanceScenarios)(
    '$name',
    async (scenario) => {
      const target = await runScenario(scenario);

      const expectedCodes =
        scenario.normalizeOutcomeOrder === true
          ? sorted(scenario.expectedOutcomeCodes)
          : scenario.expectedOutcomeCodes;
      expect(outcomeCodes(scenario, target.outcomes)).toEqual(expectedCodes);
      expect(target.clockReads).toBe(scenario.expectedClockReads);
      expect(target.issuedIds).toEqual(
        expectedIssuedIds(expectedIssuedIdCount(scenario)),
      );

      const beforeEvents = new Set(
        target.before.events.map((event) => event.id),
      );
      const newEvents = target.after.events.filter(
        (event) => !beforeEvents.has(event.id),
      );
      expect(newEvents).toHaveLength(scenario.expectedNewEventCount);
      expect(
        target.after.locations[0]!.liveRevision -
          target.before.locations[0]!.liveRevision,
      ).toBe(newEvents.length);
      for (const event of newEvents)
        expect(event.payload).toMatchObject({
          _idempotency: { version: 1 },
        });

      expect(target.telemetry).toEqual(
        expectedTargetTelemetry(target.outcomes),
      );
      for (const signal of target.signals) {
        expect(signal.state.events.length).toBeGreaterThan(
          target.before.events.length,
        );
      }
    },
    30_000,
  );
});
