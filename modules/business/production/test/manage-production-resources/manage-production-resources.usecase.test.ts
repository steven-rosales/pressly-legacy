import { describe, expect, it, vi } from 'vitest';
import type {
  ProductionBootstrapInput,
  ProductionBootstrapManifest,
} from '@pressly/contracts';
import { makeManageProductionResources } from '../../src/manage-production-resources/manage-production-resources.usecase.ts';
import type {
  ManageProductionResourcesRepository,
  StoredProductionResources,
} from '../../src/manage-production-resources/manage-production-resources.port.ts';
import type { StoredWorkEvent } from '../../src/production.port.ts';

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
    {
      locationId: 'location-1',
      kind: 'drying',
      label: 'Dry',
      sortOrder: 2,
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

const emptyResources = (): StoredProductionResources => ({
  location: null,
  stations: [],
  machines: [],
  schedulerConfig: null,
});

const setup = (initial = emptyResources()) => {
  let resources = structuredClone(initial);
  const applied = new Map<string, StoredWorkEvent>();
  const applyResources = vi.fn(async (input) => {
    resources = {
      location: input.manifest.location,
      stations: input.manifest.stations,
      machines: input.manifest.machines,
      schedulerConfig: input.manifest.schedulerConfig,
    };
    applied.set(input.idempotencyKey, {
      command: structuredClone(input.idempotency),
      result: structuredClone(input.result),
      valid: true,
    });
  });
  const repo: ManageProductionResourcesRepository = {
    transaction: (work) =>
      work({
        findWorkEvent: async (key) => structuredClone(applied.get(key) ?? null),
        loadResources: async () => structuredClone(resources),
        applyResources,
      }),
  };
  const manage = makeManageProductionResources({
    repo,
    clock: { now: () => new Date('2026-07-12T16:00:00.000Z') },
  });
  return { manage, applyResources };
};

const command = (
  dryRun: boolean,
  nextManifest = manifest(),
): ProductionBootstrapInput & { actorId: string } => ({
  manifest: nextManifest,
  dryRun,
  idempotencyKey: 'bootstrap-fixture-1',
  actorId: '11111111-1111-4111-8111-111111111111',
});

describe('production resource bootstrap', () => {
  it('reports a deterministic dry run without writing', async () => {
    const { manage, applyResources } = setup();

    const first = await manage(command(true));
    const desired = manifest();
    const reordered: ProductionBootstrapManifest = {
      ...desired,
      stations: [...desired.stations].reverse(),
    };
    const second = await manage(command(true, reordered));

    expect(first).toMatchObject({
      tag: 'ok',
      value: {
        status: 'converged',
        mode: 'dry_run',
        applied: false,
        summary: { created: 5, updated: 0, noop: 0, rejected: 0 },
      },
    });
    expect(second).toMatchObject({
      tag: 'ok',
      value: {
        configurationHash:
          first.tag === 'ok' ? first.value.configurationHash : '',
      },
    });
    expect(applyResources).not.toHaveBeenCalled();
  });

  it('applies once and replays an identical idempotency key', async () => {
    const { manage, applyResources } = setup();

    const first = await manage(command(false));
    const replay = await manage(command(false));

    expect(first).toMatchObject({
      tag: 'ok',
      value: { status: 'converged', mode: 'apply', applied: true },
    });
    expect(replay).toMatchObject({
      tag: 'ok',
      value: { status: 'converged', applied: true, replayed: true },
    });
    expect(applyResources).toHaveBeenCalledOnce();
  });

  it('rejects an idempotency key reused for a different manifest', async () => {
    const { manage, applyResources } = setup();
    await manage(command(false));

    const changed = manifest();
    changed.schedulerConfig.pulseMinutes = 42;
    await expect(manage(command(false, changed))).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', status: 409 },
    });
    expect(applyResources).toHaveBeenCalledOnce();
  });

  it('rejects removal and deactivation instead of mutating inventory', async () => {
    const desired = manifest();
    const existing: StoredProductionResources = {
      location: { ...desired.location, isActive: true },
      stations: desired.stations,
      machines: [
        ...desired.machines,
        {
          ...desired.machines[0]!,
          label: 'W-legacy',
        },
      ],
      schedulerConfig: desired.schedulerConfig,
    };
    const deactivated = {
      ...desired,
      location: { ...desired.location, isActive: false },
    };
    const { manage, applyResources } = setup(existing);

    const outcome = await manage(command(false, deactivated));

    expect(outcome).toMatchObject({
      tag: 'ok',
      value: {
        status: 'rejected',
        applied: false,
        summary: { rejected: 2 },
        rejections: [
          { code: 'destructive_resource_deactivation' },
          { code: 'destructive_resource_removal' },
        ],
      },
    });
    expect(applyResources).not.toHaveBeenCalled();
  });
});
