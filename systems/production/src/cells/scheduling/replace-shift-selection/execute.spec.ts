import { proveOperation } from '@pressly/testkit/operation-proof';
import { replaceShiftSelectionCellDeclaration } from './cell.ts';
import { databaseError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import {
  makeExecuteReplaceShiftSelection,
  type ReplaceShiftSelectionTransactionRepository,
  type ReplaceShiftSelectionWorkEventCommand,
} from './execute.ts';
import {
  replaceShiftSelectionIdempotency,
  serializeReplaceShiftSelectionWorkEventCommand,
  type StoredReplaceShiftSelectionWorkEvent,
} from './idempotency.ts';
import type {
  AvailableShiftSelection,
  ReplaceShiftSelectionCommand,
  ReplaceShiftSelectionResult,
} from './types.ts';

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  shift: '10000000-0000-4000-8000-000000000002',
  order1: '10000000-0000-4000-8000-000000000003',
  order2: '10000000-0000-4000-8000-000000000004',
  schedule: '10000000-0000-4000-8000-000000000005',
} as const;
const now = new Date('2026-08-22T14:00:00.000Z');

const command = (
  overrides: Partial<ReplaceShiftSelectionCommand> = {},
): ReplaceShiftSelectionCommand => ({
  locationId: 'location-1',
  productionShiftId: ids.shift,
  actorId: ids.actor,
  selectedOrderIds: [ids.order2, ids.order1],
  expectedVersion: 1,
  idempotencyKey: 'replace-selection-command-1',
  ...overrides,
});

const current = (
  overrides: Partial<AvailableShiftSelection> = {},
): AvailableShiftSelection => ({
  state: 'available',
  version: 1,
  selectedOrderIds: [ids.order1],
  currentSchedule: {
    scheduleRunId: ids.schedule,
    status: 'draft',
  },
  ...overrides,
});

const changedResult: ReplaceShiftSelectionResult = {
  selection: {
    productionShiftId: ids.shift,
    version: 2,
    selectedOrderIds: [ids.order1, ids.order2],
  },
  supersededScheduleRunId: ids.schedule,
  replayed: false,
};

const identity = (
  overrides: Partial<ReplaceShiftSelectionWorkEventCommand> = {},
): ReplaceShiftSelectionWorkEventCommand => ({
  operation: 'production_shift_selection_replaced',
  locationId: 'location-1',
  actorId: ids.actor,
  target: { entityType: 'production_shift', entityId: ids.shift },
  expectedVersion: 1,
  payload: { selectedOrderIds: [ids.order1, ids.order2] },
  ...overrides,
});

const transactionRepository = (
  overrides: Partial<
    ReplaceShiftSelectionTransactionRepository<StoredReplaceShiftSelectionWorkEvent>
  > = {},
) => ({
  findWorkEvent: vi.fn(async () => null),
  lockLocationScheduling: vi.fn(async () => undefined),
  lockSelection: vi.fn(async () => current()),
  selectedOrdersAreReady: vi.fn(async () => true),
  replaceSelection: vi.fn(async () => ({
    kind: 'saved' as const,
    result: changedResult,
  })),
  appendWorkEvent: vi.fn(async () => undefined),
  ...overrides,
});

const harness = (
  tx: ReplaceShiftSelectionTransactionRepository<StoredReplaceShiftSelectionWorkEvent>,
  options: {
    trace?: string[];
    signal?: () => void;
  } = {},
) => {
  const transaction = vi.fn(async (work) => {
    const outcome = await work(tx);
    options.trace?.push('transaction:complete');
    return outcome;
  });
  const clock = { now: vi.fn(() => now) };
  const planSuperseded = vi.fn(
    options.signal ?? (() => options.trace?.push('signal:plan-superseded')),
  );
  return {
    execute: makeExecuteReplaceShiftSelection({
      repo: { transaction },
      idempotency: replaceShiftSelectionIdempotency,
      policy: productionRules,
      clock,
      signals: { planSuperseded },
    }),
    transaction,
    clock,
    planSuperseded,
  };
};

describe('replace shift selection executor', () => {
  proveOperation({
    operationId: 'production.replace-shift-selection.v1',
    declaration: replaceShiftSelectionCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'preserves double replay, lock, decision, mutation, receipt, commit, then signal order',
        proves: ['executor-success'],
        run: async () => {
          const trace: string[] = [];
          let replayRead = 0;
          const tx = transactionRepository({
            findWorkEvent: vi.fn(async () => {
              trace.push(`find-work-event:${String(++replayRead)}`);
              return null;
            }),
            lockLocationScheduling: vi.fn(async () => {
              trace.push('lock:location');
            }),
            lockSelection: vi.fn(async () => {
              trace.push('lock:shift-selection-schedule');
              return current();
            }),
            selectedOrdersAreReady: vi.fn(async () => {
              trace.push('lock:selected-orders');
              return true;
            }),
            replaceSelection: vi.fn(async () => {
              trace.push('replace-selection');
              return { kind: 'saved' as const, result: changedResult };
            }),
            appendWorkEvent: vi.fn(async () => {
              trace.push('append-work-event');
            }),
          });
          const { execute, clock, planSuperseded } = harness(tx, { trace });
          clock.now.mockImplementation(() => {
            trace.push('clock:now');
            return now;
          });

          await expect(
            execute(
              command({
                selectedOrderIds: [ids.order2, ids.order1, ids.order2],
              }),
            ),
          ).resolves.toEqual({ kind: 'success', value: changedResult });
          expect(trace).toEqual([
            'find-work-event:1',
            'lock:location',
            'find-work-event:2',
            'lock:shift-selection-schedule',
            'lock:selected-orders',
            'clock:now',
            'replace-selection',
            'append-work-event',
            'transaction:complete',
            'signal:plan-superseded',
          ]);
          expect(tx.selectedOrdersAreReady).toHaveBeenCalledWith('location-1', [
            ids.order1,
            ids.order2,
          ]);
          expect(tx.replaceSelection).toHaveBeenCalledWith({
            locationId: 'location-1',
            productionShiftId: ids.shift,
            selectedOrderIds: [ids.order1, ids.order2],
            currentVersion: 1,
            supersede: {
              scheduleRunId: ids.schedule,
              lifecycle: { from: 'draft', state: 'superseded' },
            },
            actorId: ids.actor,
            now,
          });
          expect(tx.appendWorkEvent).toHaveBeenCalledWith({
            locationId: 'location-1',
            eventType: 'production_shift_selection_replaced',
            entityType: 'production_shift',
            entityId: ids.shift,
            actorId: ids.actor,
            expectedVersion: 1,
            idempotencyKey: 'replace-selection-command-1',
            payload: {
              selectedOrderIds: [ids.order1, ids.order2],
              version: 2,
              supersededScheduleRunId: ids.schedule,
            },
            idempotency: {
              command: identity(),
              result: changedResult,
            },
          });
          expect(planSuperseded).toHaveBeenCalledOnce();
        },
      },
    ],
  });

  it('replays or rejects divergence before acquiring the location lock', async () => {
    const stored = {
      command: serializeReplaceShiftSelectionWorkEventCommand(identity()),
      result: changedResult,
      valid: true,
    };
    const replayTx = transactionRepository({
      findWorkEvent: vi.fn(async () => stored),
    });
    const replay = harness(replayTx);
    await expect(replay.execute(command())).resolves.toEqual({
      kind: 'success',
      value: { ...changedResult, replayed: true },
    });
    expect(replayTx.lockLocationScheduling).not.toHaveBeenCalled();
    expect(replay.planSuperseded).not.toHaveBeenCalled();

    const conflictTx = transactionRepository({
      findWorkEvent: vi.fn(async () => stored),
    });
    const conflict = harness(conflictTx);
    await expect(
      conflict.execute(command({ expectedVersion: 2 })),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_idempotency_conflict' },
    });
    expect(conflictTx.lockLocationScheduling).not.toHaveBeenCalled();
    expect(conflict.planSuperseded).not.toHaveBeenCalled();
  });

  it('replays or rejects divergence after the location lock before row locks', async () => {
    const stored = {
      command: serializeReplaceShiftSelectionWorkEventCommand(identity()),
      result: changedResult,
      valid: true,
    };
    const replayTx = transactionRepository({
      findWorkEvent: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(stored),
    });
    const replay = harness(replayTx);
    await expect(replay.execute(command())).resolves.toEqual({
      kind: 'success',
      value: { ...changedResult, replayed: true },
    });
    expect(replayTx.lockLocationScheduling).toHaveBeenCalledOnce();
    expect(replayTx.lockSelection).not.toHaveBeenCalled();
    expect(replay.planSuperseded).not.toHaveBeenCalled();

    const conflictTx = transactionRepository({
      findWorkEvent: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...stored,
          command: {
            ...stored.command,
            actorId: '10000000-0000-4000-8000-000000000009',
          },
        }),
    });
    const conflict = harness(conflictTx);
    await expect(conflict.execute(command())).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_idempotency_conflict' },
    });
    expect(conflictTx.lockSelection).not.toHaveBeenCalled();
    expect(conflict.planSuperseded).not.toHaveBeenCalled();
  });

  it('audits an identical ready selection without version change, mutation, clock, or signal', async () => {
    const tx = transactionRepository({
      lockSelection: vi.fn(async () =>
        current({ selectedOrderIds: [ids.order2, ids.order1] }),
      ),
    });
    const { execute, clock, planSuperseded } = harness(tx);

    await expect(execute(command())).resolves.toEqual({
      kind: 'success',
      value: {
        selection: {
          productionShiftId: ids.shift,
          version: 1,
          selectedOrderIds: [ids.order1, ids.order2],
        },
        supersededScheduleRunId: null,
        replayed: false,
      },
    });
    expect(tx.selectedOrdersAreReady).toHaveBeenCalledOnce();
    expect(tx.replaceSelection).not.toHaveBeenCalled();
    expect(clock.now).not.toHaveBeenCalled();
    expect(tx.appendWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          selectedOrderIds: [ids.order1, ids.order2],
          version: 1,
          supersededScheduleRunId: null,
        },
      }),
    );
    expect(planSuperseded).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'missing shift',
      locked: { state: 'not_found' as const },
      code: 'production_shift_not_found',
    },
    {
      name: 'started shift',
      locked: { state: 'run_exists' as const },
      code: 'production_shift_already_started',
    },
    {
      name: 'stale selection',
      locked: current({ version: 2 }),
      code: 'production_shift_selection_version_conflict',
    },
  ])('rejects $name before readiness or mutation', async ({ locked, code }) => {
    const tx = transactionRepository({
      lockSelection: vi.fn(async () => locked),
    });
    const { execute, clock, planSuperseded } = harness(tx);
    await expect(execute(command())).resolves.toMatchObject({
      kind: 'failure',
      failure: { code },
    });
    expect(tx.selectedOrdersAreReady).not.toHaveBeenCalled();
    expect(tx.replaceSelection).not.toHaveBeenCalled();
    expect(tx.appendWorkEvent).not.toHaveBeenCalled();
    expect(clock.now).not.toHaveBeenCalled();
    expect(planSuperseded).not.toHaveBeenCalled();
  });

  it('rejects readiness and lifecycle drift before persistence or signals', async () => {
    const unreadyTx = transactionRepository({
      selectedOrdersAreReady: vi.fn(async () => false),
    });
    const unready = harness(unreadyTx);
    await expect(unready.execute(command())).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_shift_selection_not_ready' },
    });
    expect(unreadyTx.replaceSelection).not.toHaveBeenCalled();
    expect(unready.planSuperseded).not.toHaveBeenCalled();

    const lifecycleTx = transactionRepository({
      lockSelection: vi.fn(async () =>
        current({
          currentSchedule: {
            scheduleRunId: ids.schedule,
            status: 'superseded',
          },
        }),
      ),
    });
    const lifecycle = harness(lifecycleTx);
    await expect(lifecycle.execute(command())).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'schedule_current_plan_state_invalid' },
    });
    expect(lifecycleTx.replaceSelection).not.toHaveBeenCalled();
    expect(lifecycle.planSuperseded).not.toHaveBeenCalled();
  });

  it.each([
    {
      mutation: { kind: 'selection_conflict' as const },
      code: 'production_shift_selection_version_conflict',
    },
    {
      mutation: { kind: 'schedule_conflict' as const },
      code: 'production_shift_selection_schedule_version_conflict',
    },
  ])(
    'maps $mutation.kind without receipt or signal',
    async ({ mutation, code }) => {
      const tx = transactionRepository({
        replaceSelection: vi.fn(async () => mutation),
      });
      const { execute, planSuperseded } = harness(tx);
      await expect(execute(command())).resolves.toMatchObject({
        kind: 'failure',
        failure: { code },
      });
      expect(tx.appendWorkEvent).not.toHaveBeenCalled();
      expect(planSuperseded).not.toHaveBeenCalled();
    },
  );

  it('does not signal when a late receipt fault rejects the transaction', async () => {
    const fault = { fixture: 'late receipt failure' };
    const tx = transactionRepository({
      appendWorkEvent: vi.fn(async () => {
        throw fault;
      }),
    });
    const { execute, planSuperseded } = harness(tx);
    await expect(execute(command())).rejects.toMatchObject({
      kind: 'DatabaseError',
      code: 'production_shift_selection_failed',
      status: 503,
      cause: fault,
    });
    expect(planSuperseded).not.toHaveBeenCalled();
  });

  it('preserves AppErrors and maps unknown transaction faults exactly', async () => {
    const existing = databaseError({
      code: 'fixture_database_error',
      message: 'Fixture database error.',
      safeMessage: 'Fixture database error.',
      status: 503,
    });
    const preserved = makeExecuteReplaceShiftSelection({
      repo: {
        transaction: vi.fn(async () => {
          throw existing;
        }),
      },
      idempotency: replaceShiftSelectionIdempotency,
      policy: productionRules,
      clock: { now: () => now },
    });
    await expect(preserved(command())).rejects.toBe(existing);

    const fault = { fixture: 'unknown transaction failure' };
    const mapped = makeExecuteReplaceShiftSelection({
      repo: {
        transaction: vi.fn(async () => {
          throw fault;
        }),
      },
      idempotency: replaceShiftSelectionIdempotency,
      policy: productionRules,
      clock: { now: () => now },
    });
    await expect(mapped(command())).rejects.toMatchObject({
      kind: 'DatabaseError',
      code: 'production_shift_selection_failed',
      status: 503,
      cause: fault,
    });
  });

  it('maps an unknown post-commit signal fault without replaying or rolling back', async () => {
    const fault = { fixture: 'post-commit signal failure' };
    const tx = transactionRepository();
    const { execute, transaction, planSuperseded } = harness(tx, {
      signal: () => {
        throw fault;
      },
    });
    await expect(execute(command())).rejects.toMatchObject({
      kind: 'DatabaseError',
      code: 'production_shift_selection_failed',
      status: 503,
      cause: fault,
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.appendWorkEvent).toHaveBeenCalledOnce();
    expect(planSuperseded).toHaveBeenCalledOnce();
  });
});
