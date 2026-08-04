import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getTableConfig, getTableName } from '../src/query.ts';
import * as laundryProduction from '../src/schema/laundry-production.schema.ts';
import * as webhookIngestion from '../src/schema/webhook-ingestion.schema.ts';

describe('LPMS schema', () => {
  it('keeps proposal, execution, and ledger truth separate', () => {
    expect(getTableName(laundryProduction.scheduleRuns)).toBe('schedule_runs');
    expect(getTableName(laundryProduction.productionRuns)).toBe(
      'production_runs',
    );
    expect(getTableName(laundryProduction.workEvents)).toBe('work_events');
  });

  it('enforces production batch lifecycle timestamps in the schema', () => {
    expect(
      getTableConfig(laundryProduction.productionBatches).checks.map(
        (candidate) => candidate.name,
      ),
    ).toContain('production_batches_lifecycle_timestamps_valid');
  });

  it('exports production and ingestion through separate namespaces', () => {
    expect(Object.keys(laundryProduction)).toEqual(
      expect.arrayContaining([
        'productionLocations',
        'orderDemands',
        'productionRuns',
        'productionBatchOrders',
        'productionOrderStageAttempts',
        'workEvents',
      ]),
    );
    expect(Object.keys(webhookIngestion)).toEqual(
      expect.arrayContaining([
        'webhookEvents',
        'webhookReceiptQuarantine',
        'sourceLocationBindings',
      ]),
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
    expect(
      webhookIngestion.webhookReceiptQuarantine.payloadCiphertext.name,
    ).toBe('payload_ciphertext');
    expect(webhookIngestion.webhookReceiptQuarantine.expiresAt.name).toBe(
      'expires_at',
    );
    expect(laundryProduction.orderDemands.revisionHash.name).toBe(
      'revision_hash',
    );
    expect(laundryProduction.orderDemands.revisionAt.name).toBe('revision_at');
    expect(laundryProduction.orderDemands.phase.name).toBe('phase');
    expect(laundryProduction.orderDemands.estimatedWeightLbs.name).toBe(
      'estimated_weight_lbs',
    );
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
    expect(laundryProduction.productionLocations.liveRevision.name).toBe(
      'live_revision',
    );
    expect(laundryProduction.scheduleRuns.supersededAt.name).toBe(
      'superseded_at',
    );
    expect(laundryProduction.scheduleRuns.acceptedBy.name).toBe('accepted_by');
    expect(laundryProduction.productionRuns.queueVersion.name).toBe(
      'queue_version',
    );
    expect(laundryProduction.productionRuns.plannedCompletionAt.name).toBe(
      'planned_completion_at',
    );
    expect(laundryProduction.productionBatches.membershipFrozenAt.name).toBe(
      'membership_frozen_at',
    );
    expect(laundryProduction.stageRuns.actualStartProvenance.name).toBe(
      'actual_start_provenance',
    );
    expect(laundryProduction.stageRuns.actualEndProvenance.name).toBe(
      'actual_end_provenance',
    );
    expect(laundryProduction.stageBoundaryProvenanceEnum.enumValues).toEqual([
      'live_observed',
      'operator_reported',
      'not_recorded',
    ]);
    expect(
      laundryProduction.productionBatchOrders.placementProvenance.name,
    ).toBe('placement_provenance');
    expect(laundryProduction.productionBatchOrders.releasedAt.name).toBe(
      'released_at',
    );
    expect(
      laundryProduction.productionOrderStageAttempts.attemptNumber.name,
    ).toBe('attempt_number');

    for (const table of [
      laundryProduction.machines,
      laundryProduction.scheduleRuns,
      laundryProduction.productionRuns,
      laundryProduction.productionBatches,
      laundryProduction.productionBatchOrders,
      laundryProduction.productionOrderStageAttempts,
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

  it('normalizes legacy planning before enforcing run-centered execution', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0016_lpms-run-centered-online-scheduling.sql',
        import.meta.url,
      ),
      'utf8',
    );

    expect(migration).toContain(
      'LPMS_RUN_CENTERED_MIGRATION_MULTIPLE_RUNS_PER_SHIFT',
    );
    expect(migration).toContain(
      'LPMS_RUN_CENTERED_MIGRATION_INCONSISTENT_EXECUTION',
    );
    expect(migration).toContain(
      'UPDATE "production_orders" AS production_order',
    );
    expect(migration).toContain(
      'WHEN event."entity_type" = \'production_run\' THEN run."schedule_run_id"',
    );
    expect(migration).toContain(
      'DELETE FROM "production_runs" WHERE "status" = \'planned\'',
    );
    expect(migration).toContain('schedule_runs_one_current_per_shift_unique');
    expect(migration).toContain('production_runs_shift_unique');
    expect(migration).toContain("'fixed-pulse-ffd-v2'");
    expect(migration).toContain('production_batches_membership_freeze_paired');
    expect(migration).toContain('production_batch_orders_pin_valid');
  });

  it('publishes a durable location revision after committed production work', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0017_production_live_revisions.sql',
        import.meta.url,
      ),
      'utf8',
    );

    expect(migration).toContain('ADD COLUMN "live_revision" bigint');
    expect(migration).toContain('count(*)::bigint');
    expect(migration).toContain('pressly_notify_production_change');
    expect(migration).toContain("pg_notify(\n    'pressly_production_changes'");
    expect(migration).toContain('AFTER INSERT ON "work_events"');
  });

  it('backfills honest provenance before constraining actual stage boundaries', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0018_stage_boundary_provenance.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const startColumn =
      'ADD COLUMN "actual_start_provenance" "stage_boundary_provenance"';
    const startBackfill = 'SET "actual_start_provenance" = \'live_observed\'';
    const startConstraint =
      'ADD CONSTRAINT "stage_runs_actual_start_provenance_valid"';

    expect(migration).toContain(
      `CREATE TYPE "public"."stage_boundary_provenance" AS ENUM('live_observed', 'operator_reported', 'not_recorded')`,
    );
    expect(migration).toContain('WHERE "actual_start_at" IS NOT NULL');
    expect(migration).toContain('WHERE "actual_end_at" IS NOT NULL');
    expect(migration.indexOf(startBackfill)).toBeGreaterThan(
      migration.indexOf(startColumn),
    );
    expect(migration.indexOf(startConstraint)).toBeGreaterThan(
      migration.indexOf(startBackfill),
    );
    expect(migration).toContain('stage_runs_actual_end_provenance_valid');
    expect(migration).toContain('stage_runs_actual_window_valid');
  });

  it('anchors legacy batch starts before enforcing lifecycle timestamps', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0019_production-batch-lifecycle-timestamps.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const preflight = 'LPMS_BATCH_LIFECYCLE_MIGRATION_INCONSISTENT_TIMESTAMPS';
    const backfill =
      'SET "started_at" = COALESCE("membership_frozen_at", "updated_at")';
    const constraint = 'production_batches_lifecycle_timestamps_valid';

    expect(migration).toContain(preflight);
    expect(migration).toContain(backfill);
    expect(migration.indexOf(backfill)).toBeGreaterThan(
      migration.indexOf(preflight),
    );
    expect(migration.indexOf(constraint)).toBeGreaterThan(
      migration.indexOf(backfill),
    );
    expect(migration).toContain(
      '"status" = \'queued\' and "production_batches"."started_at" is null',
    );
    expect(migration).toContain(
      '("production_batches"."status" = \'finished\') = ("production_batches"."finished_at" is not null)',
    );
  });

  it('backfills immutable order-stage attempts before enabling floor routing', async () => {
    const migration = await readFile(
      new URL('../src/migrations/0020_fair_karma.sql', import.meta.url),
      'utf8',
    );
    const createAttempts = 'CREATE TABLE "production_order_stage_attempts"';
    const membershipIdentity =
      'ALTER TABLE "production_batch_orders" ADD COLUMN "id" uuid PRIMARY KEY';
    const preflight =
      'Cannot backfill order routes: inactive batch membership has unfinished stage work';
    const completionPreflight =
      'Cannot backfill order routes: completed stage has no actual completion boundary';
    const backfill = 'INSERT INTO "production_order_stage_attempts"';
    const routeUniqueness =
      'production_order_stage_attempts_one_assigned_unique';

    expect(migration).toContain(createAttempts);
    expect(migration).toContain(membershipIdentity);
    expect(migration).toContain(preflight);
    expect(migration).toContain(completionPreflight);
    expect(migration).toContain('\'{"backfilled":true}\'::jsonb');
    expect(migration).toContain('"production_batch_orders"."active" = false');
    expect(migration.indexOf(backfill)).toBeGreaterThan(
      migration.indexOf(preflight),
    );
    expect(migration.indexOf(routeUniqueness)).toBeGreaterThan(
      migration.indexOf(backfill),
    );
    expect(migration).not.toContain('DELETE FROM "production_batch_orders"');
  });

  it('backfills canonical demand lifecycle before enforcing constraints', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0021_lpms-demand-lifecycle-outlook.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const sourceColumn =
      'ALTER TABLE "order_demands" ADD COLUMN "source_status_code" text;';
    const lifecycleBackfill = 'UPDATE "order_demands"\nSET';
    const sourceRequired =
      'ALTER TABLE "order_demands" ALTER COLUMN "source_status_code" SET NOT NULL;';

    expect(migration).toContain('RENAME COLUMN "status" TO "phase"');
    expect(migration).toContain("THEN 'production_released'");
    expect(migration).toContain("ELSE 'expected'");
    expect(migration).toContain('UPDATE "order_demands" AS "demand"');
    expect(migration).toContain('WITH "latest_cents_receipt" AS');
    expect(migration).toContain('SELECT DISTINCT ON ("subject_id")');
    expect(migration).toContain(
      '"demand"."demand_key" = \'cents:order:\' || "backfill"."subject_id"',
    );
    expect(migration).toContain("THEN 'external_estimate'");
    expect(migration).toContain(
      'ALTER TABLE "production_orders" ALTER COLUMN "eligible_at" DROP NOT NULL',
    );
    expect(migration.indexOf(lifecycleBackfill)).toBeGreaterThan(
      migration.indexOf(sourceColumn),
    );
    expect(migration.indexOf(sourceRequired)).toBeGreaterThan(
      migration.indexOf(lifecycleBackfill),
    );
  });

  it('persists an explicit shift selection before planning can resume', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0023_lpms-shift-order-selection.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const selectionUniqueness =
      'CREATE UNIQUE INDEX "production_shift_selections_shift_location_unique"';
    const selectionForeignKey =
      'ADD CONSTRAINT "production_shift_selected_orders_selection_fk"';

    expect(getTableName(laundryProduction.productionShiftSelections)).toBe(
      'production_shift_selections',
    );
    expect(getTableName(laundryProduction.productionShiftSelectedOrders)).toBe(
      'production_shift_selected_orders',
    );
    expect(migration.indexOf(selectionUniqueness)).toBeGreaterThanOrEqual(0);
    expect(migration.indexOf(selectionForeignKey)).toBeGreaterThan(
      migration.indexOf(selectionUniqueness),
    );
    expect(migration).toContain("WHEN 'expected' THEN 'release_pending'");
    expect(migration).toContain("WHEN 'inbound' THEN 'release_pending'");
    expect(migration).toContain("WHERE \"status\" IN ('draft', 'accepted')");
  });
});
