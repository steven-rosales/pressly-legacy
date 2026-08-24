import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { manageResourcesCellDeclaration } from './cell.ts';
import {
  makeExecuteManageResources,
  type ApplyProductionResourcesInput,
} from './execute.ts';
import {
  manageResourcesIdempotency,
  serializeManageResourcesWorkEventCommand,
  type StoredManageResourcesWorkEvent,
} from './idempotency.ts';
import type {
  ManageResourcesCommand,
  ProductionBootstrapManifest,
  StoredProductionResources,
} from './types.ts';

const now = new Date('2026-08-21T15:00:00.000Z');
const manifest = (): ProductionBootstrapManifest => ({
  schemaVersion: 1,
  location: {
    id: 'location-1',
    businessId: '00000000-0000-4000-8000-000000000100',
    name: 'Synthetic Facility',
    timezone: 'America/New_York',
    isActive: true,
  },
  stations: [
    {
      locationId: 'location-1',
      kind: 'washing',
      label: 'Wash',
      sortOrder: 1,
      isActive: true,
    },
  ],
  machines: [
    {
      locationId: 'location-1',
      stationKind: 'washing',
      label: 'W-01',
      manufacturerCapacityLbs: 60,
      effectiveCapacityLbs: 54,
      capacitySafetyMarginLbs: 6,
      isActive: true,
    },
  ],
  schedulerConfig: {
    locationId: 'location-1',
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v1',
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
    },
  },
});
const empty: StoredProductionResources = {
  location: null,
  stations: [],
  machines: [],
  schedulerConfig: null,
};
const command = (
  dryRun: boolean,
  desired = manifest(),
): ManageResourcesCommand => ({
  manifest: desired,
  dryRun,
  idempotencyKey: 'bootstrap-command-1',
  actorId: '10000000-0000-4000-8000-000000000001',
});

const harness = (input: {
  stored?: StoredProductionResources;
  find?: () => Promise<StoredManageResourcesWorkEvent | null>;
  apply?: () => Promise<void>;
}) => {
  const calls: string[] = [];
  const operations = {
    findWorkEvent: vi.fn(async () => {
      calls.push('findWorkEvent');
      return input.find === undefined ? null : input.find();
    }),
    lockLocationScheduling: vi.fn(async () => {
      calls.push('lockLocationScheduling');
    }),
    loadResources: vi.fn(async () => {
      calls.push('loadResources');
      return input.stored ?? empty;
    }),
    applyResources: vi.fn(
      async (_applyInput: ApplyProductionResourcesInput) => {
        calls.push('applyResources');
        await input.apply?.();
      },
    ),
  };
  const clock = vi.fn(() => now);
  return {
    calls,
    operations,
    clock,
    execute: makeExecuteManageResources<StoredManageResourcesWorkEvent>({
      repo: { transaction: async (work) => work(operations) },
      idempotency: manageResourcesIdempotency,
      clock: { now: clock },
    }),
  };
};

describe('execute manage resources', () => {
  it('validates machine stations before opening a transaction', async () => {
    const desired = manifest();
    const transaction = vi.fn();
    const execute = makeExecuteManageResources<StoredManageResourcesWorkEvent>({
      repo: { transaction },
      idempotency: manageResourcesIdempotency,
      clock: { now: () => now },
    });
    await expect(
      execute({
        ...command(false, desired),
        manifest: { ...desired, stations: [] },
      }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        kind: 'validation',
        code: 'production_bootstrap_machine_station_missing',
      },
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('previews deterministically without checking or consuming idempotency', async () => {
    const first = harness({});
    const desired = manifest();
    const reordered = { ...desired, stations: [...desired.stations].reverse() };
    const second = harness({});
    const outcome = await first.execute(command(true, desired));
    const repeated = await second.execute(command(true, reordered));
    expect(first.calls).toEqual(['lockLocationScheduling', 'loadResources']);
    expect(first.operations.findWorkEvent).not.toHaveBeenCalled();
    expect(first.operations.applyResources).not.toHaveBeenCalled();
    expect(first.clock).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      kind: 'success',
      value: {
        status: 'converged',
        mode: 'dry_run',
        applied: false,
        summary: { created: 4 },
      },
    });
    expect(repeated).toMatchObject({
      kind: 'success',
      value: {
        configurationHash:
          outcome.kind === 'success' ? outcome.value.configurationHash : '',
      },
    });
  });

  proveOperation({
    operationId: 'production.manage-resources.v1',
    declaration: manageResourcesCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'checks replay before loading and applies one converged command exactly',
        proves: ['executor-success'],
        run: async () => {
          const run = harness({});
          const outcome = await run.execute(command(false));
          expect(run.calls).toEqual([
            'findWorkEvent',
            'lockLocationScheduling',
            'findWorkEvent',
            'loadResources',
            'applyResources',
          ]);
          expect(run.clock).toHaveBeenCalledOnce();
          expect(outcome).toMatchObject({
            kind: 'success',
            value: { status: 'converged', mode: 'apply', applied: true },
          });
          expect(run.operations.applyResources).toHaveBeenCalledWith(
            expect.objectContaining({
              manifest: manifest(),
              actorId: command(false).actorId,
              idempotencyKey: command(false).idempotencyKey,
              now,
              idempotency: expect.objectContaining({
                operation: 'production_resources_bootstrapped',
                expectedVersion: null,
                payload: expect.objectContaining({ dryRun: false }),
              }),
            }),
          );
        },
      },
    ],
  });

  it('replays an identical apply and rejects divergent key reuse before load', async () => {
    const first = harness({});
    const committed = await first.execute(command(false));
    expect(committed.kind).toBe('success');
    if (committed.kind !== 'success') return;
    const applyInput = first.operations.applyResources.mock.calls[0]?.[0];
    expect(applyInput).toBeDefined();
    if (applyInput === undefined) return;
    const stored: StoredManageResourcesWorkEvent = {
      valid: true,
      command: serializeManageResourcesWorkEventCommand(applyInput.idempotency),
      result: committed.value,
    };
    const replay = harness({ find: async () => stored });
    await expect(replay.execute(command(false))).resolves.toMatchObject({
      kind: 'success',
      value: { replayed: true },
    });
    expect(replay.calls).toEqual(['findWorkEvent']);

    let reads = 0;
    const lockedReplay = harness({
      find: async () => (reads++ === 0 ? null : stored),
    });
    await expect(lockedReplay.execute(command(false))).resolves.toMatchObject({
      kind: 'success',
      value: { replayed: true },
    });
    expect(lockedReplay.calls).toEqual([
      'findWorkEvent',
      'lockLocationScheduling',
      'findWorkEvent',
    ]);
    expect(lockedReplay.operations.loadResources).not.toHaveBeenCalled();
    expect(lockedReplay.operations.applyResources).not.toHaveBeenCalled();

    const diverged = harness({ find: async () => stored });
    await expect(
      diverged.execute(
        command(false, {
          ...manifest(),
          schedulerConfig: {
            ...manifest().schedulerConfig,
            pulseMinutes: 42,
          },
        }),
      ),
    ).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'conflict',
        code: 'production_idempotency_conflict',
        message:
          'The idempotency key belongs to a different production command.',
        safeMessage:
          'The idempotency key belongs to a different production command.',
      },
    });
    expect(diverged.calls).toEqual(['findWorkEvent']);
  });

  it('does not write or consume a receipt for a rejected apply', async () => {
    const desired = manifest();
    const stored: StoredProductionResources = {
      location: desired.location,
      stations: desired.stations,
      machines: [
        ...desired.machines,
        { ...desired.machines[0]!, label: 'W-existing' },
      ],
      schedulerConfig: desired.schedulerConfig,
    };
    const run = harness({ stored });
    await expect(run.execute(command(false))).resolves.toMatchObject({
      kind: 'success',
      value: {
        status: 'rejected',
        applied: false,
        rejections: [{ code: 'destructive_resource_removal' }],
      },
    });
    expect(run.operations.applyResources).not.toHaveBeenCalled();
    expect(run.clock).not.toHaveBeenCalled();
    await run.execute(command(false));
    expect(run.operations.findWorkEvent).toHaveBeenCalledTimes(4);
    expect(run.operations.lockLocationScheduling).toHaveBeenCalledTimes(2);
    expect(run.operations.loadResources).toHaveBeenCalledTimes(2);
  });

  it('maps unexpected repository faults through Errors ownership', async () => {
    const run = harness({ apply: () => Promise.reject('database offline') });
    await expect(run.execute(command(false))).rejects.toMatchObject({
      code: 'production_bootstrap_failed',
      message: 'Production resources could not be bootstrapped.',
      safeMessage: 'Production resources could not be bootstrapped.',
      status: 503,
    });
  });
});
