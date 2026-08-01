import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  executeProductionBootstrap,
  parseProductionBootstrapArgs,
  readProductionBootstrapManifest,
} from '../../src/commands/bootstrap-production.command.ts';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const manifest = {
  schemaVersion: 1,
  location: {
    id: 'location-test',
    businessId: '00000000-0000-4000-8000-000000000100',
    name: 'Synthetic Facility',
    timezone: 'America/New_York',
    isActive: true,
  },
  sourceLocationBindings: [
    {
      source: 'cents',
      externalLocationId: 'store-test',
      locationId: 'location-test',
      isActive: true,
    },
  ],
  stations: ['sorting', 'washing', 'drying', 'folding_packaging'].map(
    (kind, sortOrder) => ({
      locationId: 'location-test',
      kind,
      label: kind,
      sortOrder,
      isActive: true,
    }),
  ),
  machines: [
    {
      locationId: 'location-test',
      stationKind: 'washing',
      label: 'Washer test',
      manufacturerCapacityLbs: 60,
      effectiveCapacityLbs: 54,
      capacitySafetyMarginLbs: 6,
      isActive: true,
    },
  ],
  schedulerConfig: {
    locationId: 'location-test',
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v1',
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
    },
  },
};

const writeManifest = async (value: unknown = manifest): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'pressly-bootstrap-'));
  directories.push(directory);
  const file = join(directory, 'manifest.json');
  await writeFile(file, JSON.stringify(value), 'utf8');
  return file;
};

describe('production bootstrap command', () => {
  it('defaults to dry-run and requires explicit apply', () => {
    const base = [
      '--file',
      '/tmp/manifest.json',
      '--actor-id',
      '11111111-1111-4111-8111-111111111111',
      '--idempotency-key',
      'bootstrap-test-1',
    ];
    expect(parseProductionBootstrapArgs(base).dryRun).toBe(true);
    expect(parseProductionBootstrapArgs([...base, '--apply']).dryRun).toBe(
      false,
    );
    expect(() =>
      parseProductionBootstrapArgs([...base, '--dry-run', '--apply']),
    ).toThrow(/either --dry-run or --apply/i);
  });

  it('rejects invalid or cross-location manifests before application code', async () => {
    const file = await writeManifest({
      ...manifest,
      schedulerConfig: {
        ...manifest.schedulerConfig,
        locationId: 'another-location',
      },
    });
    await expect(readProductionBootstrapManifest(file)).rejects.toMatchObject({
      code: 'production_bootstrap_manifest_invalid',
    });
  });

  it('defaults omitted source bindings to an empty composition manifest', async () => {
    const file = await writeManifest({
      ...manifest,
      sourceLocationBindings: undefined,
    });

    await expect(readProductionBootstrapManifest(file)).resolves.toMatchObject({
      location: manifest.location,
      sourceLocationBindings: [],
    });
  });

  it('validates the local Pressly One topology and its known capacity', async () => {
    const local = await readProductionBootstrapManifest(
      resolve(
        import.meta.dirname,
        '../../../../tooling/fixtures/pressly-one.production-bootstrap.json',
      ),
    );
    const washing = local.machines.filter(
      (machine) => machine.stationKind === 'washing',
    );
    const drying = local.machines.filter(
      (machine) => machine.stationKind === 'drying',
    );

    expect(local.location).toMatchObject({
      id: 'pressly-one',
      name: 'Pressly One',
      timezone: 'America/New_York',
      isActive: true,
    });
    expect(local.sourceLocationBindings).toEqual([
      expect.objectContaining({
        source: 'cents',
        externalLocationId: 'tooling-store-001',
        locationId: 'pressly-one',
      }),
    ]);
    expect(washing).toHaveLength(22);
    expect(drying).toHaveLength(22);
    expect(
      washing.reduce(
        (total, machine) => total + (machine.manufacturerCapacityLbs ?? 0),
        0,
      ),
    ).toBe(740);
    expect(
      washing.reduce(
        (total, machine) => total + (machine.effectiveCapacityLbs ?? 0),
        0,
      ),
    ).toBe(674);
    expect(
      drying.reduce(
        (total, machine) => total + (machine.effectiveCapacityLbs ?? 0),
        0,
      ),
    ).toBe(660);
    expect(local.schedulerConfig).toMatchObject({
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
    });
  });

  it('composes validated production resources and source bindings', async () => {
    const file = await writeManifest();
    const manageResources = vi.fn().mockResolvedValue({
      tag: 'ok',
      value: {
        status: 'converged',
        mode: 'dry_run',
        configurationHash: 'a'.repeat(64),
        operations: [],
        rejections: [],
        summary: { created: 0, updated: 0, noop: 0, rejected: 0 },
        applied: false,
        replayed: false,
      },
    });
    const manageSourceLocationBindings = vi.fn().mockResolvedValue({
      tag: 'ok',
      value: {
        status: 'converged',
        mode: 'dry_run',
        applied: false,
        operations: [],
        rejections: [],
      },
    });
    await expect(
      executeProductionBootstrap({
        command: {
          file,
          actorId: '11111111-1111-4111-8111-111111111111',
          idempotencyKey: 'bootstrap-test-1',
          dryRun: true,
        },
        manageResources,
        manageSourceLocationBindings,
      }),
    ).resolves.toMatchObject({
      production: { status: 'converged', mode: 'dry_run' },
      sourceLocationBindings: { status: 'converged', mode: 'dry_run' },
    });
    expect(manageResources).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.not.objectContaining({
          sourceLocationBindings: expect.anything(),
        }),
        dryRun: true,
      }),
    );
    expect(manageSourceLocationBindings).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: { sourceLocationBindings: manifest.sourceLocationBindings },
        dryRun: true,
      }),
    );
  });
});
