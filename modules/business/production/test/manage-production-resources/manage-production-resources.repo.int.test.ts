import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, laundryProduction, type Database } from '@pressly/db';
import type { ProductionBootstrapManifest } from '@pressly/contracts';
import { makePostgresProductionApplication } from '../../src/main.ts';
import { createProductionTestDatabase } from '../support/database.ts';
import {
  allowPolicy,
  makeClock,
  makeIds,
  simpleScheduler,
} from '../support/production.fake.ts';

const testDb = createProductionTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const manifest: ProductionBootstrapManifest = {
  schemaVersion: 1,
  location: {
    id: 'location-bootstrap',
    businessId: '00000000-0000-4000-8000-000000000100',
    name: 'Synthetic Facility',
    timezone: 'America/New_York',
    isActive: true,
  },
  stations: (
    ['sorting', 'washing', 'drying', 'folding_packaging'] as const
  ).map((kind, index) => ({
    locationId: 'location-bootstrap',
    kind,
    label: kind,
    sortOrder: index + 1,
    isActive: true,
  })),
  machines: [
    {
      locationId: 'location-bootstrap',
      stationKind: 'washing',
      label: 'W-01',
      manufacturerCapacityLbs: 60,
      effectiveCapacityLbs: 54,
      capacitySafetyMarginLbs: 6,
      isActive: true,
    },
    {
      locationId: 'location-bootstrap',
      stationKind: 'drying',
      label: 'D-01',
      manufacturerCapacityLbs: 30,
      effectiveCapacityLbs: 30,
      capacitySafetyMarginLbs: 0,
      isActive: true,
    },
  ],
  schedulerConfig: {
    locationId: 'location-bootstrap',
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

const rowsFor = async (db: Database) => {
  const locations = await db
    .select()
    .from(laundryProduction.productionLocations)
    .where(eq(laundryProduction.productionLocations.id, manifest.location.id));
  const stations = await db
    .select()
    .from(laundryProduction.stations)
    .where(eq(laundryProduction.stations.locationId, manifest.location.id));
  const machines = await db
    .select()
    .from(laundryProduction.machines)
    .where(eq(laundryProduction.machines.locationId, manifest.location.id));
  const configs = await db
    .select()
    .from(laundryProduction.schedulerConfigs)
    .where(
      eq(laundryProduction.schedulerConfigs.locationId, manifest.location.id),
    );
  const events = await db
    .select()
    .from(laundryProduction.workEvents)
    .where(eq(laundryProduction.workEvents.locationId, manifest.location.id));
  return { locations, stations, machines, configs, events };
};

describe('production resource bootstrap repository', () => {
  it('dry-runs without writes and converges repeated apply', async () => {
    const application = makePostgresProductionApplication({
      db: testDb.db,
      policy: allowPolicy,
      scheduler: simpleScheduler,
      clock: makeClock('2026-07-12T16:00:00.000Z').clock,
      ids: makeIds(),
    });
    const actorId = '11111111-1111-4111-8111-111111111111';

    await expect(
      application.manageProductionResources({
        manifest,
        dryRun: true,
        idempotencyKey: 'bootstrap-dry-run',
        actorId,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        status: 'converged',
        mode: 'dry_run',
        applied: false,
        summary: { created: 8 },
      },
    });
    expect((await rowsFor(testDb.db)).locations).toHaveLength(0);

    const command = {
      manifest,
      dryRun: false,
      idempotencyKey: 'bootstrap-apply-1',
      actorId,
    } as const;
    const applied = await application.manageProductionResources(command);
    if (applied.tag === 'err') throw applied.error.cause ?? applied.error;
    expect(applied).toMatchObject({
      tag: 'ok',
      value: { status: 'converged', applied: true, replayed: false },
    });
    await expect(
      application.manageProductionResources(command),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { status: 'converged', applied: true, replayed: true },
    });
    await expect(
      application.manageProductionResources({
        ...command,
        manifest: {
          ...manifest,
          schedulerConfig: {
            ...manifest.schedulerConfig,
            pulseMinutes: 42,
          },
        },
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', status: 409 },
    });
    await expect(
      application.manageProductionResources({
        ...command,
        idempotencyKey: 'bootstrap-apply-2',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        status: 'converged',
        applied: true,
        replayed: false,
        summary: { created: 0, updated: 0, noop: 8, rejected: 0 },
      },
    });

    const rows = await rowsFor(testDb.db);
    expect(rows.locations).toHaveLength(1);
    expect(rows.stations).toHaveLength(4);
    expect(rows.machines).toHaveLength(2);
    expect(rows.configs).toHaveLength(1);
    expect(rows.events).toHaveLength(2);
    expect(
      rows.events.every(
        (event) => event.entityType === 'production_resource_manifest',
      ),
    ).toBe(true);
  });
});
