import { schedulingProductionSystemDependencies } from './support/production-system-dependencies.ts';
import {
  makeProductionSystem,
  type ProductionSystemUnitOfWorkObserver,
} from '@pressly/production-system/testing/assembly';
import type { AcceptScheduleCommand } from '@pressly/production-system/operations/scheduling/accept-schedule/types';
import type { IdSource } from '@pressly/cells/id-source';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acceptScheduleConformanceIds as ids,
  acceptScheduleConformanceLocationId as locationId,
  acceptScheduleConformanceNow as now,
  acceptScheduleConformanceOtherLocationId as otherLocationId,
  acceptScheduleConformanceOutputHash as outputHash,
  createAcceptScheduleConformanceDatabase,
  readAcceptScheduleConformanceState,
  resetAcceptScheduleConformanceDatabase,
  seedAcceptScheduleConformance,
  type AcceptScheduleConformanceDatabase,
  type AcceptScheduleFixture,
} from './support/accept-schedule-conformance-fixture.ts';

type TransactionOutcome = 'committed' | 'expected_rollback' | 'failed';

const runtime = createAcceptScheduleConformanceDatabase();
const database = runtime.database;

beforeAll(runtime.setup, 180_000);
afterAll(async () => {
  expect(await runtime.closeForceDropAndVerifyAbsent()).toBe(false);
}, 30_000);

const command = (
  overrides: Partial<AcceptScheduleCommand> = {},
): AcceptScheduleCommand => ({
  locationId,
  scheduleRunId: ids.schedule,
  expectedOutputPlanHash: outputHash,
  acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'OVERSIZED_ORDER'],
  idempotencyKey: 'accept-schedule-conformance-1',
  actorId: ids.actor,
  ...overrides,
});

const trackedIds = (eventId: string) => {
  const issued: string[] = [];
  const source: IdSource = Object.freeze({
    next: () => {
      const value =
        issued.length === 0
          ? eventId
          : `36000000-0000-4000-8000-${String(issued.length + 1).padStart(12, '0')}`;
      issued.push(value);
      return value;
    },
  });
  return Object.freeze({ source, issued: () => Object.freeze([...issued]) });
};

const normalizedFailure = (failure: unknown) => {
  const value =
    typeof failure === 'object' && failure !== null
      ? (failure as Record<string, unknown>)
      : {};
  return {
    kind: value['kind'] ?? null,
    classification: value['classification'] ?? null,
    code: value['code'] ?? null,
    message: value['message'] ?? null,
    safeMessage: value['safeMessage'] ?? null,
  };
};

const normalizedThrowable = (error: unknown) => {
  const value =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)
      : {};
  return {
    kind: value['kind'] ?? null,
    code: value['code'] ?? null,
    status: value['status'] ?? null,
    message: value['message'] ?? null,
    safeMessage: value['safeMessage'] ?? null,
  };
};

type CanonicalOutcome =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{ kind: 'failure'; failure: ReturnType<typeof normalizedFailure> }>
  | Readonly<{
      kind: 'unexpected';
      error: ReturnType<typeof normalizedThrowable>;
    }>;

type Executor = Readonly<{
  execute: (input: AcceptScheduleCommand) => Promise<CanonicalOutcome>;
  clockReads: () => number;
  issuedIds: () => readonly string[];
  telemetry: () => readonly TransactionOutcome[];
}>;

const makeExecutor = (input: {
  database: AcceptScheduleConformanceDatabase;
  eventId: string;
  clockNow?: Date;
}): Executor => {
  const identifiers = trackedIds(input.eventId);
  let clockReads = 0;
  const telemetry: TransactionOutcome[] = [];
  const clock = {
    now: () => {
      clockReads += 1;
      return new Date(input.clockNow ?? now);
    },
  };

  const observeCellUnitOfWork: ProductionSystemUnitOfWorkObserver = (
    operation,
    unitOfWork,
  ) => {
    if (operation !== 'production.accept_schedule') return unitOfWork;
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
  const executeTarget = makeProductionSystem({
    ...schedulingProductionSystemDependencies(),

    db: input.database.db,
    ids: identifiers.source,
    clock,
    observeCellUnitOfWork,
  }).cells.acceptSchedule.execute;
  return Object.freeze({
    execute: async (inputCommand) => {
      try {
        const outcome = await executeTarget(inputCommand);
        return outcome.kind === 'success'
          ? outcome
          : {
              kind: 'failure',
              failure: normalizedFailure(outcome.failure),
            };
      } catch (error) {
        return { kind: 'unexpected', error: normalizedThrowable(error) };
      }
    },
    clockReads: () => clockReads,
    issuedIds: identifiers.issued,
    telemetry: () => Object.freeze([...telemetry]),
  });
};

const runOnce = async (input: {
  fixture?: AcceptScheduleFixture;
  inputCommand?: AcceptScheduleCommand;
  clockNow?: Date;
  eventId?: string;
}) => {
  await resetAcceptScheduleConformanceDatabase(database);
  await seedAcceptScheduleConformance(database.db, input.fixture);
  const before = await readAcceptScheduleConformanceState(database.db);
  const executor = makeExecutor({
    database,
    eventId: input.eventId ?? ids.event,
    ...(input.clockNow === undefined ? {} : { clockNow: input.clockNow }),
  });
  const outcome = await executor.execute(input.inputCommand ?? command());
  const after = await readAcceptScheduleConformanceState(database.db);
  return Object.freeze({
    outcome,
    before,
    after,
    clockReads: executor.clockReads(),
    issuedIds: executor.issuedIds(),
    telemetry: executor.telemetry(),
  });
};

const canonicalRaceState = <
  State extends Awaited<ReturnType<typeof readAcceptScheduleConformanceState>>,
>(
  state: State,
  normalizeWinner: boolean,
) =>
  normalizeWinner
    ? {
        ...state,
        workEvents: state.workEvents.map((event) => ({
          ...event,
          idempotencyKey:
            event.eventType === 'schedule_accepted'
              ? 'accept-schedule-race-winner'
              : event.idempotencyKey,
        })),
      }
    : state;

const runRace = async (input: {
  commands: readonly [AcceptScheduleCommand, AcceptScheduleCommand];
  normalizeWinner?: boolean;
}) => {
  await resetAcceptScheduleConformanceDatabase(database);
  await seedAcceptScheduleConformance(database.db, { fault: 'slow_receipt' });
  const first = makeExecutor({
    database,
    eventId: ids.event,
  });
  const second = makeExecutor({
    database,
    eventId: ids.event,
  });
  const firstOutcome = first.execute(input.commands[0]);
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
  const outcomes = await Promise.all([
    firstOutcome,
    second.execute(input.commands[1]),
  ]);
  const state = await readAcceptScheduleConformanceState(database.db);
  const winnerKey =
    state.workEvents.find((event) => event.eventType === 'schedule_accepted')
      ?.idempotencyKey ?? null;
  return Object.freeze({
    outcomes: Object.freeze(
      [...outcomes].sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
    ),
    state: canonicalRaceState(state, input.normalizeWinner === true),
    winnerKey,
    clockReads: first.clockReads() + second.clockReads(),
    issuedIds: Object.freeze([...first.issuedIds(), ...second.issuedIds()]),
    telemetry: Object.freeze(
      [...first.telemetry(), ...second.telemetry()].sort(),
    ),
  });
};

describe('production.accept-schedule.v1 public PostgreSQL conformance', () => {
  it('accepts the reverse-declared v2 snapshot, sorts persistence, and preserves caller warning identity on replay/divergence', async () => {
    const sequence = async () => {
      await resetAcceptScheduleConformanceDatabase(database);
      await seedAcceptScheduleConformance(database.db);
      const executor = makeExecutor({
        database,
        eventId: ids.event,
      });
      const original = command({
        idempotencyKey: 'accept-schedule-sequence',
        acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'OVERSIZED_ORDER'],
      });
      const outcomes = [
        await executor.execute(original),
        await executor.execute(original),
        await executor.execute({
          ...original,
          acknowledgedWarningCodes: ['OVERSIZED_ORDER', 'SHIFT_OVERFLOW'],
        }),
      ];
      return Object.freeze({
        outcomes,
        state: await readAcceptScheduleConformanceState(database.db),
        clockReads: executor.clockReads(),
        issuedIds: executor.issuedIds(),
        telemetry: executor.telemetry(),
      });
    };

    const target = await sequence();
    expect(target.outcomes).toEqual([
      expect.objectContaining({
        kind: 'success',
        value: expect.objectContaining({ replayed: false }),
      }),
      expect.objectContaining({
        kind: 'success',
        value: expect.objectContaining({ replayed: true }),
      }),
      expect.objectContaining({
        kind: 'failure',
        failure: expect.objectContaining({
          code: 'production_idempotency_conflict',
        }),
      }),
    ]);
    expect(target.clockReads).toBe(1);
    expect(target.issuedIds).toEqual([ids.event]);
    expect(target.state.schedules[0]).toMatchObject({
      status: 'accepted',
      acceptedAt: now,
      acceptedBy: ids.actor,
      acknowledgedWarningCodes: ['OVERSIZED_ORDER', 'SHIFT_OVERFLOW'],
    });
    expect(target.state.workEvents).toEqual([
      expect.objectContaining({
        id: ids.event,
        locationId,
        eventType: 'schedule_accepted',
        entityType: 'schedule_run',
        entityId: ids.schedule,
        actorId: ids.actor,
        expectedVersion: null,
        idempotencyKey: 'accept-schedule-sequence',
        payload: {
          scheduleRunId: ids.schedule,
          acknowledgedWarningCodes: ['OVERSIZED_ORDER', 'SHIFT_OVERFLOW'],
          _idempotency: {
            version: 1,
            command: {
              operation: 'schedule_accepted',
              locationId,
              actorId: ids.actor,
              target: { entityType: 'schedule_run', entityId: ids.schedule },
              expectedVersion: null,
              payload: {
                expectedOutputPlanHash: outputHash,
                acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'OVERSIZED_ORDER'],
              },
            },
            result: {
              scheduleRunId: ids.schedule,
              productionShiftId: ids.shift,
              acceptedAt: now.toISOString(),
              replayed: false,
            },
          },
        },
      }),
    ]);
    expect(target.state.locations).toEqual([
      { id: locationId, liveRevision: 1 },
      { id: otherLocationId, liveRevision: 0 },
    ]);
    expect(target.state.runs).toEqual([]);
    expect(target.telemetry).toEqual([
      'committed',
      'committed',
      'expected_rollback',
    ]);
  });

  it.each([
    {
      name: 'cross-location schedule is not found before clock or IDs',
      inputCommand: command({ locationId: otherLocationId }),
      code: 'schedule_not_found',
      clockReads: 0,
    },
    {
      name: 'expired shift rejects after the one acceptance clock read',
      clockNow: new Date('2026-08-22T21:00:00.000Z'),
      code: 'production_shift_expired',
      clockReads: 1,
    },
    {
      name: 'existing run protects the already-started shift',
      fixture: { runExists: true } as AcceptScheduleFixture,
      code: 'production_shift_already_started',
      clockReads: 1,
    },
    {
      name: 'non-draft schedule preserves the lifecycle guard',
      fixture: { scheduleStatus: 'accepted' } as AcceptScheduleFixture,
      code: 'schedule_not_draft',
      clockReads: 1,
    },
    {
      name: 'reviewed output hash fences proposal drift',
      inputCommand: command({ expectedOutputPlanHash: 'e'.repeat(64) }),
      code: 'schedule_hash_mismatch',
      clockReads: 1,
    },
    {
      name: 'every blocking warning remains acknowledgement-bound',
      inputCommand: command({
        acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
      }),
      code: 'schedule_warning_not_acknowledged',
      clockReads: 1,
    },
    {
      name: 'unissued warning acknowledgement remains invalid',
      inputCommand: command({
        acknowledgedWarningCodes: [
          'SHIFT_OVERFLOW',
          'OVERSIZED_ORDER',
          'NO_ACTIVE_WASHERS',
        ],
      }),
      code: 'schedule_warning_acknowledgement_invalid',
      clockReads: 1,
    },
    {
      name: 'empty schedule proposal preserves the structural guard',
      fixture: { noBatches: true } as AcceptScheduleFixture,
      code: 'schedule_has_no_batches',
      clockReads: 1,
    },
    {
      name: 'locked selected-order snapshot rejects version drift',
      fixture: { snapshotStale: true } as AcceptScheduleFixture,
      code: 'schedule_input_snapshot_stale',
      clockReads: 1,
    },
  ])('$name', async ({ fixture, inputCommand, clockNow, code, clockReads }) => {
    const target = await runOnce({
      ...(fixture === undefined ? {} : { fixture }),
      ...(inputCommand === undefined ? {} : { inputCommand }),
      ...(clockNow === undefined ? {} : { clockNow }),
    });
    expect(target.outcome).toMatchObject({
      kind: 'failure',
      failure: { code },
    });
    expect(target.clockReads).toBe(clockReads);
    expect(target.issuedIds).toEqual([]);
    expect(target.after).toEqual(target.before);
    expect(target.telemetry).toEqual(['expected_rollback']);
  });

  it('uses the after-location-lock replay for concurrent identical acceptance', async () => {
    const raceCommand = command({
      idempotencyKey: 'accept-schedule-after-lock-replay',
    });
    const target = await runRace({
      commands: [raceCommand, raceCommand],
    });
    expect(target.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'success',
          value: expect.objectContaining({ replayed: false }),
        }),
        expect.objectContaining({
          kind: 'success',
          value: expect.objectContaining({ replayed: true }),
        }),
      ]),
    );
    expect(target.clockReads).toBe(1);
    expect(target.state.workEvents).toHaveLength(1);
    expect(target.state.locations).toContainEqual({
      id: locationId,
      liveRevision: 1,
    });
    expect(target.telemetry).toEqual(['committed', 'committed']);
  });

  it('uses the after-location-lock replay to reject concurrent caller-order divergence', async () => {
    const idempotencyKey = 'accept-schedule-after-lock-divergence';
    const commands = [
      command({
        idempotencyKey,
        acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'OVERSIZED_ORDER'],
      }),
      command({
        idempotencyKey,
        acknowledgedWarningCodes: ['OVERSIZED_ORDER', 'SHIFT_OVERFLOW'],
      }),
    ] as const;
    const target = await runRace({ commands });
    expect(
      target.outcomes.filter(({ kind }) => kind === 'success'),
    ).toHaveLength(1);
    expect(target.outcomes).toContainEqual(
      expect.objectContaining({
        kind: 'failure',
        failure: expect.objectContaining({
          code: 'production_idempotency_conflict',
        }),
      }),
    );
    expect(target.telemetry).toEqual(['committed', 'expected_rollback']);
  });

  it('serializes different-key acceptance so exactly one writer commits', async () => {
    const commands = [
      command({ idempotencyKey: 'accept-schedule-race-a' }),
      command({ idempotencyKey: 'accept-schedule-race-b' }),
    ] as const;
    const target = await runRace({
      commands,
      normalizeWinner: true,
    });
    expect(
      target.outcomes.filter(({ kind }) => kind === 'success'),
    ).toHaveLength(1);
    expect(target.outcomes).toContainEqual(
      expect.objectContaining({
        kind: 'failure',
        failure: expect.objectContaining({ code: 'schedule_not_draft' }),
      }),
    );
    expect(['accept-schedule-race-a', 'accept-schedule-race-b']).toContain(
      target.winnerKey,
    );
    expect(target.telemetry).toEqual(['committed', 'expected_rollback']);
  });

  it('preserves late schedule CAS rollback and result-UoW telemetry', async () => {
    const target = await runOnce({
      fixture: { fault: 'late_schedule_cas' },
    });
    expect(target.outcome).toMatchObject({
      kind: 'failure',
      failure: {
        code: 'production_schedule_already_accepted',
        safeMessage: 'Production state changed. Refresh and try again.',
      },
    });
    expect(target.after).toEqual(target.before);
    expect(target.after.workEvents).toEqual([]);
    expect(target.telemetry).toEqual(['expected_rollback']);
  });

  it('preserves late receipt failure rollback, exact AppError mapping, and revision', async () => {
    const target = await runOnce({
      fixture: { receiptCollision: true },
      eventId: ids.collision,
      inputCommand: command({
        idempotencyKey: 'accept-schedule-receipt-rollback',
      }),
    });
    expect(target.outcome).toEqual({
      kind: 'unexpected',
      error: {
        kind: 'DatabaseError',
        code: 'schedule_accept_failed',
        status: 503,
        message: 'The schedule proposal could not be accepted.',
        safeMessage: 'The schedule proposal could not be accepted.',
      },
    });
    expect(target.after).toEqual(target.before);
    expect(target.after.schedules[0]).toMatchObject({ status: 'draft' });
    expect(target.after.workEvents).toEqual([
      expect.objectContaining({
        id: ids.collision,
        eventType: 'fixture_collision',
      }),
    ]);
    expect(target.after.locations).toContainEqual({
      id: locationId,
      liveRevision: 1,
    });
    expect(target.telemetry).toEqual(['failed']);
  });
});
