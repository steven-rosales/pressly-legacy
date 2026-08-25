import { proveOperation } from '@pressly/testkit/operation-proof';
import { publishSchedulerConfigCellDeclaration } from './cell.ts';
import { databaseError } from '@pressly/errors/factories';
import type { IdSource } from '@pressly/cells/id-source';
import { describe, expect, it, vi } from 'vitest';
import {
  makeExecutePublishSchedulerConfig,
  type PublishSchedulerConfigTransactionRepository,
} from './execute.ts';
import {
  publishSchedulerConfigIdempotency,
  serializePublishSchedulerConfigWorkEventCommand,
  type StoredPublishSchedulerConfigWorkEvent,
} from './idempotency.ts';
import type {
  PublishSchedulerConfigCommand,
  SchedulerConfig,
} from './types.ts';

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  config: '10000000-0000-4000-8000-000000000002',
} as const;
const now = new Date('2026-08-22T14:00:00.000Z');

const command = (
  overrides: Partial<PublishSchedulerConfigCommand> = {},
): PublishSchedulerConfigCommand => ({
  locationId: 'location-1',
  actorId: ids.actor,
  pulseMinutes: 56,
  foldLbsPerFolderMinute: 2,
  stageFitAssertion: {
    sortingFits: true,
    washingFits: true,
    dryingFits: true,
  },
  idempotencyKey: 'scheduler-config-command-1',
  ...overrides,
});

const expectedConfig: SchedulerConfig = {
  id: ids.config,
  pulseMinutes: 56,
  foldLbsPerFolderMinute: 2,
  algorithmVersion: 'fixed-pulse-ffd-v2',
  version: 4,
  stageFitAssertion: {
    sortingFits: true,
    washingFits: true,
    dryingFits: true,
    assertedBy: ids.actor,
    assertedAt: now.toISOString(),
  },
  publishedAt: now.toISOString(),
};

const transactionRepository = (
  stored: StoredPublishSchedulerConfigWorkEvent | null = null,
) => ({
  findWorkEvent: vi.fn(async () => stored),
  lockLocationScheduling: vi.fn(async () => undefined),
  nextSchedulerConfigVersion: vi.fn(async () => 4),
  saveSchedulerConfig: vi.fn(async (_locationId, config) => config),
  appendWorkEvent: vi.fn(async () => undefined),
});

const harness = (
  tx: PublishSchedulerConfigTransactionRepository<StoredPublishSchedulerConfigWorkEvent>,
  idSource: IdSource = { next: vi.fn(() => ids.config) },
) => {
  const transaction = vi.fn(async (work) => work(tx));
  const clock = { now: vi.fn(() => now) };
  return {
    execute: makeExecutePublishSchedulerConfig({
      repo: { transaction },
      idempotency: publishSchedulerConfigIdempotency,
      clock,
      ids: idSource,
    }),
    transaction,
    clock,
    idSource,
  };
};

const identity = () => ({
  operation: 'scheduler_config_published' as const,
  locationId: 'location-1',
  actorId: ids.actor,
  target: { entityType: 'scheduler_config' as const, entityId: null },
  expectedVersion: null,
  payload: {
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    stageFitAssertion: {
      sortingFits: true as const,
      washingFits: true as const,
      dryingFits: true as const,
    },
  },
});

describe('publish scheduler config executor', () => {
  proveOperation({
    operationId: 'production.publish-scheduler-config.v1',
    declaration: publishSchedulerConfigCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'checks replay before versioning, then commits the config and exact receipt',
        proves: ['executor-success'],
        run: async () => {
          const trace: string[] = [];
          const tx = {
            findWorkEvent: vi.fn(async () => {
              trace.push('find-work-event');
              return null;
            }),
            lockLocationScheduling: vi.fn(async () => {
              trace.push('lock-location');
            }),
            nextSchedulerConfigVersion: vi.fn(async () => {
              trace.push('next-version');
              return 4;
            }),
            saveSchedulerConfig: vi.fn(async (_locationId, config) => {
              trace.push('save-config');
              return config;
            }),
            appendWorkEvent: vi.fn(async () => {
              trace.push('append-work-event');
            }),
          };
          const idSource = {
            next: vi.fn(() => {
              trace.push('config-id');
              return ids.config;
            }),
          };
          const { execute, clock } = harness(tx, idSource);
          clock.now.mockImplementation(() => {
            trace.push('clock-now');
            return now;
          });

          await expect(execute(command())).resolves.toEqual({
            kind: 'success',
            value: expectedConfig,
          });
          expect(trace).toEqual([
            'find-work-event',
            'lock-location',
            'find-work-event',
            'clock-now',
            'config-id',
            'next-version',
            'save-config',
            'append-work-event',
          ]);
          expect(tx.saveSchedulerConfig).toHaveBeenCalledWith(
            'location-1',
            expectedConfig,
          );
          expect(tx.appendWorkEvent).toHaveBeenCalledWith({
            locationId: 'location-1',
            eventType: 'scheduler_config_published',
            entityType: 'scheduler_config',
            entityId: ids.config,
            actorId: ids.actor,
            idempotencyKey: 'scheduler-config-command-1',
            payload: { version: 4 },
            idempotency: { command: identity(), result: expectedConfig },
          });
        },
      },
    ],
  });

  it.each([{ pulseMinutes: 0 }, { foldLbsPerFolderMinute: 0 }])(
    'rejects semantic invalidity before opening a transaction: %o',
    async (override) => {
      const tx = transactionRepository();
      const { execute, transaction, clock, idSource } = harness(tx);

      await expect(execute(command(override))).resolves.toMatchObject({
        kind: 'failure',
        failure: {
          kind: 'validation',
          code: 'scheduler_config_invalid',
        },
      });
      expect(transaction).not.toHaveBeenCalled();
      expect(clock.now).not.toHaveBeenCalled();
      expect(idSource.next).not.toHaveBeenCalled();
    },
  );

  it('replays exact receipts and rejects divergence before time, IDs, or version reads', async () => {
    const stored = {
      command: serializePublishSchedulerConfigWorkEventCommand(identity()),
      result: expectedConfig,
      valid: true,
    };
    const replayTx = transactionRepository(stored);
    const replay = harness(replayTx);
    await expect(replay.execute(command())).resolves.toEqual({
      kind: 'success',
      value: expectedConfig,
    });
    expect(replayTx.nextSchedulerConfigVersion).not.toHaveBeenCalled();
    expect(replayTx.saveSchedulerConfig).not.toHaveBeenCalled();
    expect(replayTx.appendWorkEvent).not.toHaveBeenCalled();
    expect(replay.clock.now).not.toHaveBeenCalled();
    expect(replay.idSource.next).not.toHaveBeenCalled();

    const conflictTx = transactionRepository(stored);
    const conflict = harness(conflictTx);
    await expect(
      conflict.execute(command({ foldLbsPerFolderMinute: 3 })),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        kind: 'conflict',
        code: 'production_idempotency_conflict',
      },
    });
    expect(conflictTx.nextSchedulerConfigVersion).not.toHaveBeenCalled();
    expect(conflictTx.saveSchedulerConfig).not.toHaveBeenCalled();
    expect(conflict.clock.now).not.toHaveBeenCalled();
    expect(conflict.idSource.next).not.toHaveBeenCalled();
  });

  it('preserves AppErrors and maps unknown transaction faults to the exact database error', async () => {
    const existing = databaseError({
      code: 'fixture_database_error',
      message: 'Fixture database error.',
      safeMessage: 'Fixture database error.',
      status: 503,
    });
    const preserved = makeExecutePublishSchedulerConfig({
      repo: {
        transaction: vi.fn(async () => {
          throw existing;
        }),
      },
      idempotency: publishSchedulerConfigIdempotency,
      clock: { now: () => now },
      ids: { next: () => ids.config },
    });
    await expect(preserved(command())).rejects.toBe(existing);

    const fault = { fixture: 'deliberate unknown transaction fault' };
    const mapped = makeExecutePublishSchedulerConfig({
      repo: {
        transaction: vi.fn(async () => {
          throw fault;
        }),
      },
      idempotency: publishSchedulerConfigIdempotency,
      clock: { now: () => now },
      ids: { next: () => ids.config },
    });
    await expect(mapped(command())).rejects.toMatchObject({
      kind: 'DatabaseError',
      code: 'scheduler_config_publish_failed',
      message: 'The scheduler configuration could not be published.',
      safeMessage: 'The scheduler configuration could not be published.',
      status: 503,
      cause: fault,
    });
  });
});
