import { schedulingProductionSystemDependencies } from './support/production-system-dependencies.ts';
import type {
  PostgresDatabase,
  PostgresTransaction,
} from '@pressly/postgres/client';
import { sql } from '@pressly/postgres/query';
import type { IdSource } from '@pressly/cells/id-source';
import {
  makeProductionSystem,
  type ProductionSystemUnitOfWorkObserver,
} from '@pressly/production-system/testing/assembly';
import type { UpdateShiftCommand } from '@pressly/production-system/operations/scheduling/update-shift/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  captureUpdateShiftOutcome,
  makeUpdateShiftConformanceCommand,
  updateShiftConformanceIds as ids,
  updateShiftConformanceLocationId as locationId,
  updateShiftConformanceNow as now,
  updateShiftConformanceScenarios,
  updateShiftOutcomeCode,
  type CanonicalUpdateShiftOutcome,
  type UpdateShiftFixture,
  type UpdateShiftObservation,
  type UpdateShiftScenario,
  type UpdateShiftSignal,
  type UpdateShiftTransactionOutcome,
} from '../src/update-shift-conformance.ts';
import {
  createUpdateShiftConformanceDatabase,
  readUpdateShiftConformanceState,
  readUpdateShiftIdempotencyReceipts,
  resetUpdateShiftConformanceDatabase,
  seedUpdateShiftConformance,
  type UpdateShiftConformanceDatabase,
} from './support/update-shift-conformance-fixture.ts';

const runtime = createUpdateShiftConformanceDatabase();
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

const trackedIds = (fixture: UpdateShiftFixture) => {
  const values =
    fixture.fault === 'event_append'
      ? ([ids.collision] as const)
      : ([ids.eventA, ids.eventB] as const);
  const issued: string[] = [];
  const source: IdSource = Object.freeze({
    next: () => {
      const value =
        values[issued.length] ??
        `47000000-0000-4000-8000-${String(issued.length + 1).padStart(12, '0')}`;
      issued.push(value);
      return value;
    },
  });
  return Object.freeze({
    source,
    issued: () => Object.freeze([...issued]),
  });
};

type ConformanceExecutor = Readonly<{
  execute: (command: UpdateShiftCommand) => Promise<unknown>;
  capture: (
    execute: (command: UpdateShiftCommand) => Promise<unknown>,
    command: UpdateShiftCommand,
  ) => Promise<CanonicalUpdateShiftOutcome>;
  clockReads: () => number;
  issuedIds: () => readonly string[];
  signalReads: readonly Promise<UpdateShiftSignal>[];
  transactionTelemetry: readonly UpdateShiftTransactionOutcome[];
}>;

const makeExecutor = (
  database: UpdateShiftConformanceDatabase,
  fixture: UpdateShiftFixture,
): ConformanceExecutor => {
  const clock = trackedClock();
  const identifiers = trackedIds(fixture);
  const signalReads: Promise<UpdateShiftSignal>[] = [];
  const transactionTelemetry: UpdateShiftTransactionOutcome[] = [];
  const planSuperseded = () => {
    signalReads.push(
      readUpdateShiftConformanceState(database.db).then((state) => ({
        kind: 'plan_superseded' as const,
        state,
      })),
    );
  };

  const observeCellUnitOfWork: ProductionSystemUnitOfWorkObserver = (
    operation,
    unitOfWork,
  ) => {
    if (operation !== 'production.update_shift') return unitOfWork;
    return Object.freeze({
      transaction: async (work) => {
        try {
          const outcome = await unitOfWork.transaction(work);
          transactionTelemetry.push(
            outcome.tag === 'ok' ? 'committed' : 'expected_rollback',
          );
          return outcome;
        } catch (error) {
          transactionTelemetry.push('failed');
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
    signals: { planSuperseded },
    observeCellUnitOfWork,
  });
  return Object.freeze({
    execute: system.cells.updateShift.execute,
    capture: captureUpdateShiftOutcome,
    clockReads: clock.reads,
    issuedIds: identifiers.issued,
    signalReads,
    transactionTelemetry,
  });
};

const concurrentOutcomes = async (
  executor: ConformanceExecutor,
  commands: readonly UpdateShiftCommand[],
): Promise<readonly CanonicalUpdateShiftOutcome[]> => {
  const [first, ...rest] = commands;
  if (first === undefined) return [];
  const firstOutcome = executor.capture(executor.execute, first);
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
  const laterOutcomes = rest.map((command) =>
    executor.capture(executor.execute, command),
  );
  return Promise.all([firstOutcome, ...laterOutcomes]);
};

const runConformance = async (
  database: UpdateShiftConformanceDatabase,
  scenario: UpdateShiftScenario,
): Promise<UpdateShiftObservation> => {
  await resetUpdateShiftConformanceDatabase(database);
  await seedUpdateShiftConformance(database.db, scenario.fixture);
  const before = await readUpdateShiftConformanceState(database.db);
  const executor = makeExecutor(database, scenario.fixture);
  const outcomes =
    scenario.executionMode === 'concurrent'
      ? await concurrentOutcomes(executor, scenario.commands)
      : await Promise.all(
          scenario.commands.map((command) =>
            executor.capture(executor.execute, command),
          ),
        );
  const after = await readUpdateShiftConformanceState(database.db);
  const signals = await Promise.all(executor.signalReads);
  return Object.freeze({
    outcomes: Object.freeze([...outcomes]),
    stateDelta: Object.freeze({ before, after }),
    idempotencyReceipts: readUpdateShiftIdempotencyReceipts(
      after,
      scenario.commands.map((command) => command.idempotencyKey),
    ),
    signals: Object.freeze(signals),
    clockReads: executor.clockReads(),
    issuedIds: executor.issuedIds(),
    transactionTelemetry: Object.freeze([...executor.transactionTelemetry]),
  });
};

const outcomeCodes = (
  scenario: UpdateShiftScenario,
  outcomes: readonly CanonicalUpdateShiftOutcome[],
): readonly string[] => {
  const codes = outcomes.map(updateShiftOutcomeCode);
  return scenario.normalizeOutcomeOrder === true ? [...codes].sort() : codes;
};

const sortedTelemetry = (
  values: readonly UpdateShiftTransactionOutcome[],
): readonly UpdateShiftTransactionOutcome[] => [...values].sort();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

describe('production.update-shift.v1 PostgreSQL conformance', () => {
  it.each(updateShiftConformanceScenarios)(
    '$name',
    async (scenario) => {
      const observation = await runConformance(database, scenario);
      expect(outcomeCodes(scenario, observation.outcomes)).toEqual(
        scenario.expectedOutcomeCodes,
      );
      expect(sortedTelemetry(observation.transactionTelemetry)).toEqual(
        sortedTelemetry(scenario.expectedTelemetry),
      );
      const freshSuccesses = observation.outcomes.filter(
        (outcome) => outcome.kind === 'success' && !outcome.value.replayed,
      );
      const priorEventIds = new Set(
        observation.stateDelta.before.workEvents.map((event) => event.id),
      );
      const newEvents = observation.stateDelta.after.workEvents.filter(
        (event) => !priorEventIds.has(event.id),
      );
      expect(newEvents).toHaveLength(freshSuccesses.length);
      expect(
        observation.stateDelta.after.liveRevision -
          observation.stateDelta.before.liveRevision,
      ).toBe(newEvents.length);

      if (freshSuccesses.length === 0)
        expect(observation.stateDelta.after).toEqual(
          observation.stateDelta.before,
        );

      for (const outcome of observation.outcomes) {
        if (outcome.kind !== 'success') continue;
        expect(observation.stateDelta.after.shifts).toContainEqual(
          expect.objectContaining(outcome.value.productionShift),
        );
        if (
          !outcome.value.replayed &&
          outcome.value.supersededScheduleRunId !== null
        )
          expect(observation.stateDelta.after.schedules).toContainEqual(
            expect.objectContaining({
              id: outcome.value.supersededScheduleRunId,
              status: 'superseded',
              supersededAt: now.toISOString(),
            }),
          );
      }

      const receiptResults = newEvents.flatMap((event) => {
        if (!isRecord(event.payload)) return [];
        const envelope = event.payload['_idempotency'];
        return isRecord(envelope) && isRecord(envelope['result'])
          ? [envelope['result']]
          : [];
      });
      expect(receiptResults).toEqual(
        expect.arrayContaining(
          freshSuccesses.map((outcome) => {
            if (outcome.kind !== 'success') return {};
            return { ...outcome.value, replayed: false };
          }),
        ),
      );

      const supersededSuccesses = freshSuccesses.filter(
        (outcome) =>
          outcome.kind === 'success' &&
          outcome.value.supersededScheduleRunId !== null,
      );
      expect(observation.signals).toHaveLength(supersededSuccesses.length);
      for (const signal of observation.signals)
        expect(signal.state).toEqual(observation.stateDelta.after);

      const lateClockFailure =
        scenario.fixture.fault === 'shift_cas' ||
        scenario.fixture.fault === 'schedule_cas' ||
        scenario.fixture.fault === 'event_append';
      expect(observation.clockReads).toBe(
        freshSuccesses.length + (lateClockFailure ? 1 : 0),
      );
      expect(observation.issuedIds).toHaveLength(
        freshSuccesses.length +
          (scenario.fixture.fault === 'event_append' ? 1 : 0),
      );
    },
    30_000,
  );
});

type LockBlocker = Readonly<{
  ready: Promise<void>;
  release: () => void;
  completed: Promise<void>;
}>;

const blocker = (
  db: PostgresDatabase,
  acquire: (transaction: PostgresTransaction) => Promise<unknown>,
): LockBlocker => {
  let markReady: () => void = () => undefined;
  let release: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const completed = db.transaction(async (transaction) => {
    await acquire(transaction);
    markReady();
    await released;
  });
  return Object.freeze({ ready, release, completed });
};

const waitingLockCount = async (
  db: PostgresDatabase,
  kind: 'advisory' | 'non_advisory',
): Promise<number> => {
  const [row] = await db.execute<{ waiting: number }>(
    kind === 'advisory'
      ? sql`select count(*)::int as waiting from pg_locks where database = (select oid from pg_database where datname = current_database()) and locktype = 'advisory' and granted = false`
      : sql`select count(*)::int as waiting from pg_locks where locktype = 'transactionid' and granted = false`,
  );
  return row?.waiting ?? 0;
};

const waitForBlockedLock = async (
  db: PostgresDatabase,
  kind: 'advisory' | 'non_advisory',
): Promise<boolean> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await waitingLockCount(db, kind)) > 0) return true;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  return false;
};

const proveAdvisoryLockPrecedesShiftRow = async (
  database: UpdateShiftConformanceDatabase,
): Promise<void> => {
  await resetUpdateShiftConformanceDatabase(database);
  const fixture = { shift: 'open', scheduleStatus: 'accepted' } as const;
  await seedUpdateShiftConformance(database.db, fixture);

  const advisoryBlocker = blocker(database.db, (transaction) =>
    transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
    ),
  );
  await advisoryBlocker.ready;
  const advisoryExecutor = makeExecutor(database, fixture);
  const advisoryOutcome = advisoryExecutor.capture(
    advisoryExecutor.execute,
    makeUpdateShiftConformanceCommand({
      idempotencyKey: 'update-shift-lock-order-advisory',
    }),
  );
  try {
    expect(await waitForBlockedLock(database.db, 'advisory')).toBe(true);
    await expect(
      database.db.transaction((transaction) =>
        transaction.execute(
          sql`select id from production_shifts where id = ${ids.shift} for update nowait`,
        ),
      ),
    ).resolves.toBeDefined();
  } finally {
    advisoryBlocker.release();
    await advisoryBlocker.completed;
  }
  expect(updateShiftOutcomeCode(await advisoryOutcome)).toBe('success:new');
  await Promise.all(advisoryExecutor.signalReads);
};

const proveShiftRowPrecedesCurrentSchedule = async (
  database: UpdateShiftConformanceDatabase,
): Promise<void> => {
  await resetUpdateShiftConformanceDatabase(database);
  const fixture = { shift: 'open', scheduleStatus: 'accepted' } as const;
  await seedUpdateShiftConformance(database.db, fixture);
  const shiftBlocker = blocker(database.db, (transaction) =>
    transaction.execute(
      sql`select id from production_shifts where id = ${ids.shift} for update`,
    ),
  );
  await shiftBlocker.ready;
  const shiftExecutor = makeExecutor(database, fixture);
  const shiftOutcome = shiftExecutor.capture(
    shiftExecutor.execute,
    makeUpdateShiftConformanceCommand({
      idempotencyKey: 'update-shift-lock-order-shift',
    }),
  );
  try {
    expect(await waitForBlockedLock(database.db, 'non_advisory')).toBe(true);
    await expect(
      database.db.transaction((transaction) =>
        transaction.execute(
          sql`select id from schedule_runs where id = ${ids.schedule} for update nowait`,
        ),
      ),
    ).resolves.toBeDefined();
  } finally {
    shiftBlocker.release();
    await shiftBlocker.completed;
  }
  expect(updateShiftOutcomeCode(await shiftOutcome)).toBe('success:new');
  await Promise.all(shiftExecutor.signalReads);
};

describe('update-shift PostgreSQL lock order', () => {
  it(
    'acquires the location scheduling advisory lock before the shift row',
    () => proveAdvisoryLockPrecedesShiftRow(database),
    30_000,
  );

  it(
    'acquires the shift row before the current schedule row',
    () => proveShiftRowPrecedesCurrentSchedule(database),
    30_000,
  );
});
