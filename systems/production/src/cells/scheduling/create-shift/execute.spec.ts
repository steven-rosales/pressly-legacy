import { proveOperation } from '@pressly/testkit/operation-proof';
import { createShiftCellDeclaration } from './cell.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import {
  makeExecuteCreateShift,
  type CreateShiftTransactionRepository,
} from './execute.ts';
import {
  createShiftIdempotency,
  serializeCreateShiftWorkEventCommand,
  type StoredCreateShiftWorkEvent,
} from './idempotency.ts';
import type { CreateShiftCommand, ProductionShift } from './types.ts';

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  shift: '10000000-0000-4000-8000-000000000002',
} as const;

const command = (overrides: Partial<CreateShiftCommand> = {}) => ({
  locationId: 'location-1',
  startsAt: '2026-08-22T13:00:00.000Z',
  endsAt: '2026-08-22T21:00:00.000Z',
  timezone: 'America/New_York',
  effectiveFolderCount: 4,
  idempotencyKey: 'create-shift-command-1',
  actorId: ids.actor,
  ...overrides,
});

const expectedShift: ProductionShift = {
  id: ids.shift,
  locationId: 'location-1',
  startsAt: '2026-08-22T13:00:00.000Z',
  endsAt: '2026-08-22T21:00:00.000Z',
  timezone: 'America/New_York',
  effectiveFolderCount: 4,
  status: 'open',
  version: 1,
};

const transactionRepository = (
  stored: StoredCreateShiftWorkEvent | null = null,
) => ({
  findWorkEvent: vi.fn(async () => stored),
  saveShift: vi.fn(async () => undefined),
  appendWorkEvent: vi.fn(async () => undefined),
});

const harness = (
  tx: CreateShiftTransactionRepository<StoredCreateShiftWorkEvent>,
  idSource: IdSource = { next: vi.fn(() => ids.shift) },
) => {
  const transaction = vi.fn(async (work) => work(tx));
  return {
    execute: makeExecuteCreateShift({
      repo: { transaction },
      idempotency: createShiftIdempotency,
      policy: productionRules,
      ids: idSource,
    }),
    transaction,
    idSource,
  };
};

describe('create shift executor', () => {
  proveOperation({
    operationId: 'production.create-shift.v1',
    declaration: createShiftCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'creates one shift and its exact work-event receipt atomically',
        proves: ['executor-success'],
        run: async () => {
          const tx = transactionRepository();
          const { execute, transaction, idSource } = harness(tx);

          await expect(execute(command())).resolves.toEqual({
            kind: 'success',
            value: expectedShift,
          });
          expect(transaction).toHaveBeenCalledOnce();
          expect(idSource.next).toHaveBeenCalledOnce();
          expect(tx.saveShift).toHaveBeenCalledWith(expectedShift);
          expect(tx.appendWorkEvent).toHaveBeenCalledWith({
            locationId: 'location-1',
            eventType: 'production_shift_created',
            entityType: 'production_shift',
            entityId: ids.shift,
            actorId: ids.actor,
            idempotencyKey: 'create-shift-command-1',
            payload: {
              startsAt: expectedShift.startsAt,
              endsAt: expectedShift.endsAt,
            },
            idempotency: {
              command: {
                operation: 'production_shift_created',
                locationId: 'location-1',
                actorId: ids.actor,
                target: { entityType: 'production_shift', entityId: null },
                expectedVersion: null,
                payload: {
                  startsAt: expectedShift.startsAt,
                  endsAt: expectedShift.endsAt,
                  timezone: expectedShift.timezone,
                  effectiveFolderCount: expectedShift.effectiveFolderCount,
                },
              },
              result: expectedShift,
            },
          });
        },
      },
    ],
  });

  it('rejects invalid windows before transaction or identity allocation', async () => {
    const tx = transactionRepository();
    const { execute, transaction, idSource } = harness(tx);

    await expect(
      execute(command({ endsAt: '2026-08-22T13:00:00.000Z' })),
    ).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'validation',
        classification: 'semantic',
        code: 'production_shift_window_invalid',
        message: 'Shift end must be after shift start.',
        safeMessage: 'Shift end must be after shift start.',
      },
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(idSource.next).not.toHaveBeenCalled();
  });

  it('replays an exact receipt and rejects divergent key reuse without writes', async () => {
    const identity = {
      operation: 'production_shift_created' as const,
      locationId: 'location-1',
      actorId: ids.actor,
      target: { entityType: 'production_shift' as const, entityId: null },
      expectedVersion: null,
      payload: {
        startsAt: expectedShift.startsAt,
        endsAt: expectedShift.endsAt,
        timezone: expectedShift.timezone,
        effectiveFolderCount: expectedShift.effectiveFolderCount,
      },
    };
    const stored = {
      command: serializeCreateShiftWorkEventCommand(identity),
      result: expectedShift,
      valid: true,
    };
    const replayTx = transactionRepository(stored);
    const replay = harness(replayTx);
    await expect(replay.execute(command())).resolves.toEqual({
      kind: 'success',
      value: expectedShift,
    });
    expect(replayTx.saveShift).not.toHaveBeenCalled();
    expect(replay.idSource.next).not.toHaveBeenCalled();

    const conflictTx = transactionRepository(stored);
    const conflict = harness(conflictTx);
    await expect(
      conflict.execute(command({ effectiveFolderCount: 5 })),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        kind: 'conflict',
        code: 'production_idempotency_conflict',
      },
    });
    expect(conflictTx.saveShift).not.toHaveBeenCalled();
    expect(conflict.idSource.next).not.toHaveBeenCalled();
  });
});
