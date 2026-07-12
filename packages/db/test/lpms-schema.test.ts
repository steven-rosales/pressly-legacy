import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  getTableName,
  laundryProduction,
  webhookIngestion,
} from '../src/index.ts';

describe('LPMS schema', () => {
  it('keeps proposal, execution, and ledger truth separate', () => {
    expect(getTableName(laundryProduction.scheduleRuns)).toBe('schedule_runs');
    expect(getTableName(laundryProduction.productionRuns)).toBe(
      'production_runs',
    );
    expect(getTableName(laundryProduction.workEvents)).toBe('work_events');
  });

  it('exports production and ingestion through separate namespaces', () => {
    expect(Object.keys(laundryProduction)).toEqual(
      expect.arrayContaining([
        'productionLocations',
        'orderDemands',
        'productionRuns',
        'productionBatchOrders',
        'workEvents',
      ]),
    );
    expect(Object.keys(webhookIngestion)).toEqual(
      expect.arrayContaining(['webhookEvents', 'sourceLocationBindings']),
    );
  });

  it('names minimized event, source-ordering, location, and intake columns explicitly', () => {
    expect(webhookIngestion.webhookEvents.subjectType.name).toBe(
      'subject_type',
    );
    expect(webhookIngestion.webhookEvents.payload.name).toBe('payload_json');
    expect(webhookIngestion.webhookEvents.rawBodySha256.name).toBe(
      'raw_body_sha256',
    );
    expect(webhookIngestion.webhookEvents.sourceOccurredAt.name).toBe(
      'source_occurred_at',
    );
    expect(laundryProduction.orderDemands.revisionHash.name).toBe(
      'revision_hash',
    );
    expect(laundryProduction.orderDemands.revisionAt.name).toBe('revision_at');
    expect(laundryProduction.productionOrders.locationId.name).toBe(
      'location_id',
    );
    expect(laundryProduction.productionOrders.bagCount.name).toBe('bag_count');
    expect(laundryProduction.productionOrders.intakeVersion.name).toBe(
      'intake_version',
    );
    expect(laundryProduction.schedulerConfigs.locationId.name).toBe(
      'location_id',
    );
    expect(laundryProduction.workEvents.locationId.name).toBe('location_id');

    for (const table of [
      laundryProduction.machines,
      laundryProduction.scheduleRuns,
      laundryProduction.productionRuns,
      laundryProduction.productionBatches,
      laundryProduction.productionBatchOrders,
      laundryProduction.stageRuns,
      laundryProduction.stageMachineAssignments,
    ]) {
      expect(table.locationId.name).toBe('location_id');
    }
  });

  it('quarantines legacy location, intake, and unsigned receipt facts during upgrade', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0012_lpms-production-readiness.sql',
        import.meta.url,
      ),
      'utf8',
    );

    expect(migration).toContain("'__legacy_unmapped__'");
    expect(migration).toContain("'intake_pending'");
    expect(migration).toContain("'legacy-unavailable'");
    expect(migration).toContain("'LEGACY_RECEIPT_REQUIRES_SIGNED_REPLAY'");
    expect(migration).toMatch(
      /WHEN "status" = 'processed' THEN 'processed'\s+ELSE 'dead'/,
    );
  });

  it('backfills location closure before enforcing non-null composite relationships', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0013_lpms-location-closure.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const nullableColumn =
      'ALTER TABLE "production_machines" ADD COLUMN "location_id" text;';
    const machineBackfill = 'UPDATE "production_machines" AS machine';
    const requiredColumn =
      'ALTER TABLE "production_machines" ALTER COLUMN "location_id" SET NOT NULL;';

    expect(migration.indexOf(nullableColumn)).toBeGreaterThanOrEqual(0);
    expect(migration.indexOf(machineBackfill)).toBeGreaterThan(
      migration.indexOf(nullableColumn),
    );
    expect(migration.indexOf(requiredColumn)).toBeGreaterThan(
      migration.indexOf(machineBackfill),
    );
    expect(migration).toContain('CREATE TEMP TABLE "lpms_config_location_map"');
    expect(migration).toContain('ELSE gen_random_uuid()');
    expect(migration).toContain('schedule_runs_config_location_fk');
    expect(migration).toContain('production_orders_crm_location_fk');
  });

  it('migrates vendor-shaped persistence into generic ingestion and production truth', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0015_lpms-module-boundaries.sql',
        import.meta.url,
      ),
      'utf8',
    );

    expect(migration).toContain(
      'ALTER TABLE "webhook_events" RENAME COLUMN "vendor" TO "source"',
    );
    expect(migration).toContain(
      'ALTER TABLE "cents_store_locations" RENAME TO "source_location_bindings"',
    );
    expect(migration).toContain(
      'ALTER TABLE "crm_orders" RENAME TO "order_demands"',
    );
    expect(migration).toContain(
      `"demand_key" = 'cents:order:' || "display_reference"`,
    );
    expect(migration).toContain('DROP TABLE "crm_order_services"');
    expect(migration).toContain(
      'RENAME COLUMN "crm_order_id" TO "order_demand_id"',
    );
  });
});
