import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it } from 'vitest';
import { manageResourcesCellDeclaration } from './cell.ts';
import {
  compareProductionResources,
  decideManageResourcesResult,
  hashProductionBootstrapManifest,
  validateProductionBootstrapManifest,
} from './decide.ts';
import type {
  ManageResourcesCommand,
  ProductionBootstrapManifest,
  StoredProductionResources,
} from './types.ts';

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

const empty: StoredProductionResources = {
  location: null,
  stations: [],
  machines: [],
  schedulerConfig: null,
};

const command = (
  desired = manifest(),
  dryRun = false,
): ManageResourcesCommand => ({
  manifest: desired,
  dryRun,
  idempotencyKey: 'bootstrap-fixture-1',
  actorId: '10000000-0000-4000-8000-000000000001',
});

describe('manage resources decisions', () => {
  it('hashes the stable manifest bytes while normalizing collection order', () => {
    const desired = manifest();
    expect(hashProductionBootstrapManifest(desired)).toBe(
      'a093fe98b9a302cb901dc8c29c431c796a491e97a0c5eb3bde54606f9c7833e1',
    );
    expect(
      hashProductionBootstrapManifest({
        ...desired,
        stations: [...desired.stations].reverse(),
        machines: [...desired.machines].reverse(),
      }),
    ).toBe(hashProductionBootstrapManifest(desired));
  });

  it('rejects a machine whose station is absent from the same manifest', () => {
    const desired = manifest();
    expect(
      validateProductionBootstrapManifest({
        ...desired,
        stations: desired.stations.filter(
          (station) => station.kind !== 'washing',
        ),
      }),
    ).toEqual({
      kind: 'validation',
      classification: 'malformed',
      code: 'production_bootstrap_machine_station_missing',
      message:
        'Every production machine must reference a station in the same manifest.',
      safeMessage:
        'Every production machine must reference a station in the same manifest.',
    });
  });

  it('preserves location, desired collection, and scheduler operation order', () => {
    expect(compareProductionResources(manifest(), empty)).toEqual({
      operations: [
        {
          resourceType: 'location',
          naturalKey: 'location-1',
          outcome: 'created',
          changedFields: ['resource'],
        },
        {
          resourceType: 'station',
          naturalKey: 'washing',
          outcome: 'created',
          changedFields: ['resource'],
        },
        {
          resourceType: 'station',
          naturalKey: 'drying',
          outcome: 'created',
          changedFields: ['resource'],
        },
        {
          resourceType: 'machine',
          naturalKey: 'washing:W-01',
          outcome: 'created',
          changedFields: ['resource'],
        },
        {
          resourceType: 'scheduler_config',
          naturalKey: 'location-1',
          outcome: 'created',
          changedFields: ['resource'],
        },
      ],
      rejections: [],
    });
  });

  proveOperation({
    operationId: 'production.manage-resources.v1',
    declaration: manageResourcesCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'sorts changed fields and reports exact no-op counts',
        proves: ['decision'],
        run: () => {
          const desired = manifest();
          const converged: StoredProductionResources = {
            location: desired.location,
            stations: desired.stations,
            machines: desired.machines,
            schedulerConfig: desired.schedulerConfig,
          };
          expect(
            decideManageResourcesResult({
              command: command(desired, true),
              configurationHash: hashProductionBootstrapManifest(desired),
              stored: converged,
            }),
          ).toMatchObject({
            status: 'converged',
            mode: 'dry_run',
            applied: false,
            summary: { created: 0, updated: 0, noop: 5, rejected: 0 },
          });

          const changed = {
            ...desired,
            location: {
              ...desired.location,
              name: 'Changed',
              timezone: 'America/Chicago',
            },
          };
          expect(
            compareProductionResources(changed, converged).operations[0],
          ).toEqual({
            resourceType: 'location',
            naturalKey: 'location-1',
            outcome: 'updated',
            changedFields: ['name', 'timezone'],
          });
        },
      },
    ],
  });

  it('allows new inactive resources and reactivation but not deactivation', () => {
    const desired = manifest();
    const inactiveMachine = { ...desired.machines[0]!, isActive: false };
    expect(
      compareProductionResources(
        { ...desired, machines: [inactiveMachine] },
        empty,
      ).operations,
    ).toContainEqual(
      expect.objectContaining({
        resourceType: 'machine',
        naturalKey: 'washing:W-01',
        outcome: 'created',
      }),
    );
    expect(
      compareProductionResources(desired, {
        ...empty,
        machines: [inactiveMachine],
      }).operations,
    ).toContainEqual({
      resourceType: 'machine',
      naturalKey: 'washing:W-01',
      outcome: 'updated',
      changedFields: ['isActive'],
    });
  });

  it('orders natural-key, removal, and deactivation rejections exactly', () => {
    const desired = manifest();
    const stored: StoredProductionResources = {
      location: desired.location,
      stations: [
        { ...desired.stations[0]!, locationId: 'other-location' },
        desired.stations[1]!,
      ],
      machines: [
        desired.machines[0]!,
        { ...desired.machines[0]!, label: 'W-existing' },
      ],
      schedulerConfig: desired.schedulerConfig,
    };
    const comparison = compareProductionResources(
      {
        ...desired,
        stations: [desired.stations[0]!],
        machines: [{ ...desired.machines[0]!, isActive: false }],
      },
      stored,
    );
    expect(comparison.rejections).toEqual([
      {
        resourceType: 'station',
        naturalKey: 'washing',
        outcome: 'rejected',
        code: 'natural_key_change',
        message:
          'A natural key is already owned by another production location.',
      },
      {
        resourceType: 'station',
        naturalKey: 'drying',
        outcome: 'rejected',
        code: 'destructive_resource_removal',
        message: 'Bootstrap cannot remove an existing production resource.',
      },
      {
        resourceType: 'machine',
        naturalKey: 'washing:W-01',
        outcome: 'rejected',
        code: 'destructive_resource_deactivation',
        message: 'Bootstrap cannot deactivate an existing production resource.',
      },
      {
        resourceType: 'machine',
        naturalKey: 'washing:W-existing',
        outcome: 'rejected',
        code: 'destructive_resource_removal',
        message: 'Bootstrap cannot remove an existing production resource.',
      },
    ]);
    expect(
      decideManageResourcesResult({
        command: command({
          ...desired,
          stations: [desired.stations[0]!],
          machines: [{ ...desired.machines[0]!, isActive: false }],
        }),
        configurationHash: hashProductionBootstrapManifest(desired),
        stored,
      }),
    ).toMatchObject({
      status: 'rejected',
      applied: false,
      summary: { rejected: 4 },
    });
  });
});
