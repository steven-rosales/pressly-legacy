ALTER TABLE "production_machines" DROP CONSTRAINT "production_machines_station_id_production_stations_id_fk";
--> statement-breakpoint
ALTER TABLE "production_batch_orders" DROP CONSTRAINT "production_batch_orders_production_batch_id_production_batches_id_fk";
--> statement-breakpoint
ALTER TABLE "production_batch_orders" DROP CONSTRAINT "production_batch_orders_production_order_id_production_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "production_batches" DROP CONSTRAINT "production_batches_production_run_id_production_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "production_orders" DROP CONSTRAINT "production_orders_crm_order_id_crm_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "production_runs" DROP CONSTRAINT "production_runs_production_shift_id_production_shifts_id_fk";
--> statement-breakpoint
ALTER TABLE "production_runs" DROP CONSTRAINT "production_runs_schedule_run_id_schedule_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "schedule_runs" DROP CONSTRAINT "schedule_runs_production_shift_id_production_shifts_id_fk";
--> statement-breakpoint
ALTER TABLE "schedule_runs" DROP CONSTRAINT "schedule_runs_scheduler_config_id_scheduler_configs_id_fk";
--> statement-breakpoint
ALTER TABLE "stage_machine_assignments" DROP CONSTRAINT "stage_machine_assignments_stage_run_id_stage_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "stage_machine_assignments" DROP CONSTRAINT "stage_machine_assignments_machine_id_production_machines_id_fk";
--> statement-breakpoint
ALTER TABLE "stage_runs" DROP CONSTRAINT "stage_runs_production_batch_id_production_batches_id_fk";
--> statement-breakpoint
ALTER TABLE "stage_runs" DROP CONSTRAINT "stage_runs_station_id_production_stations_id_fk";
--> statement-breakpoint

ALTER TABLE "production_machines" ADD COLUMN "location_id" text;
--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD COLUMN "location_id" text;
--> statement-breakpoint
ALTER TABLE "production_batches" ADD COLUMN "location_id" text;
--> statement-breakpoint
ALTER TABLE "production_runs" ADD COLUMN "location_id" text;
--> statement-breakpoint
ALTER TABLE "schedule_runs" ADD COLUMN "location_id" text;
--> statement-breakpoint
ALTER TABLE "stage_machine_assignments" ADD COLUMN "location_id" text;
--> statement-breakpoint
ALTER TABLE "stage_runs" ADD COLUMN "location_id" text;
--> statement-breakpoint

UPDATE "production_machines" AS machine
SET "location_id" = station."location_id"
FROM "production_stations" AS station
WHERE station."id" = machine."station_id";
--> statement-breakpoint
UPDATE "schedule_runs" AS schedule
SET "location_id" = shift."location_id"
FROM "production_shifts" AS shift
WHERE shift."id" = schedule."production_shift_id";
--> statement-breakpoint

CREATE TEMP TABLE "lpms_config_location_map" ON COMMIT DROP AS
SELECT
  config."id" AS "original_id",
  schedule."location_id",
  row_number() OVER (
    PARTITION BY config."id"
    ORDER BY schedule."location_id"
  ) AS "ordinal",
  NULL::uuid AS "mapped_id"
FROM "scheduler_configs" AS config
JOIN (
  SELECT DISTINCT "scheduler_config_id", "location_id"
  FROM "schedule_runs"
) AS schedule ON schedule."scheduler_config_id" = config."id";
--> statement-breakpoint
UPDATE "lpms_config_location_map"
SET "mapped_id" = CASE
  WHEN "ordinal" = 1 THEN "original_id"
  ELSE gen_random_uuid()
END;
--> statement-breakpoint
UPDATE "scheduler_configs" AS config
SET "location_id" = mapping."location_id"
FROM "lpms_config_location_map" AS mapping
WHERE mapping."original_id" = config."id" AND mapping."ordinal" = 1;
--> statement-breakpoint
INSERT INTO "scheduler_configs" (
  "id",
  "location_id",
  "pulse_minutes",
  "fold_lbs_per_folder_minute",
  "algorithm_version",
  "version",
  "stage_fit_assertion",
  "asserted_by",
  "published_at"
)
SELECT
  mapping."mapped_id",
  mapping."location_id",
  config."pulse_minutes",
  config."fold_lbs_per_folder_minute",
  config."algorithm_version",
  config."version",
  config."stage_fit_assertion",
  config."asserted_by",
  config."published_at"
FROM "lpms_config_location_map" AS mapping
JOIN "scheduler_configs" AS config ON config."id" = mapping."original_id"
WHERE mapping."ordinal" > 1;
--> statement-breakpoint
UPDATE "schedule_runs" AS schedule
SET "scheduler_config_id" = mapping."mapped_id"
FROM "lpms_config_location_map" AS mapping
WHERE
  mapping."original_id" = schedule."scheduler_config_id"
  AND mapping."location_id" = schedule."location_id";
--> statement-breakpoint

UPDATE "production_runs" AS run
SET "location_id" = shift."location_id"
FROM "production_shifts" AS shift
WHERE shift."id" = run."production_shift_id";
--> statement-breakpoint
UPDATE "production_batches" AS batch
SET "location_id" = run."location_id"
FROM "production_runs" AS run
WHERE run."id" = batch."production_run_id";
--> statement-breakpoint
UPDATE "production_batch_orders" AS batch_order
SET "location_id" = batch."location_id"
FROM "production_batches" AS batch
WHERE batch."id" = batch_order."production_batch_id";
--> statement-breakpoint
UPDATE "stage_runs" AS stage
SET "location_id" = batch."location_id"
FROM "production_batches" AS batch
WHERE batch."id" = stage."production_batch_id";
--> statement-breakpoint
UPDATE "stage_machine_assignments" AS assignment
SET "location_id" = stage."location_id"
FROM "stage_runs" AS stage
WHERE stage."id" = assignment."stage_run_id";
--> statement-breakpoint

ALTER TABLE "production_machines" ALTER COLUMN "location_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "production_batch_orders" ALTER COLUMN "location_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "production_batches" ALTER COLUMN "location_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "production_runs" ALTER COLUMN "location_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "schedule_runs" ALTER COLUMN "location_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stage_machine_assignments" ALTER COLUMN "location_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stage_runs" ALTER COLUMN "location_id" SET NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX "crm_orders_id_location_unique" ON "crm_orders" USING btree ("id", "location_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "production_machines_id_location_unique" ON "production_machines" USING btree ("id", "location_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "production_batches_id_location_unique" ON "production_batches" USING btree ("id", "location_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "production_orders_id_location_unique" ON "production_orders" USING btree ("id", "location_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "production_runs_id_location_unique" ON "production_runs" USING btree ("id", "location_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "production_shifts_id_location_unique" ON "production_shifts" USING btree ("id", "location_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_runs_id_location_unique" ON "schedule_runs" USING btree ("id", "location_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "scheduler_configs_id_location_unique" ON "scheduler_configs" USING btree ("id", "location_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "stage_runs_id_location_unique" ON "stage_runs" USING btree ("id", "location_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "production_stations_id_location_unique" ON "production_stations" USING btree ("id", "location_id");
--> statement-breakpoint

ALTER TABLE "production_machines" ADD CONSTRAINT "production_machines_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id");
--> statement-breakpoint
ALTER TABLE "production_machines" ADD CONSTRAINT "production_machines_station_location_fk" FOREIGN KEY ("station_id", "location_id") REFERENCES "public"."production_stations"("id", "location_id");
--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD CONSTRAINT "production_batch_orders_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id");
--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD CONSTRAINT "production_batch_orders_batch_location_fk" FOREIGN KEY ("production_batch_id", "location_id") REFERENCES "public"."production_batches"("id", "location_id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD CONSTRAINT "production_batch_orders_order_location_fk" FOREIGN KEY ("production_order_id", "location_id") REFERENCES "public"."production_orders"("id", "location_id");
--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id");
--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_run_location_fk" FOREIGN KEY ("production_run_id", "location_id") REFERENCES "public"."production_runs"("id", "location_id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_crm_location_fk" FOREIGN KEY ("crm_order_id", "location_id") REFERENCES "public"."crm_orders"("id", "location_id");
--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id");
--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_shift_location_fk" FOREIGN KEY ("production_shift_id", "location_id") REFERENCES "public"."production_shifts"("id", "location_id");
--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_schedule_location_fk" FOREIGN KEY ("schedule_run_id", "location_id") REFERENCES "public"."schedule_runs"("id", "location_id");
--> statement-breakpoint
ALTER TABLE "schedule_runs" ADD CONSTRAINT "schedule_runs_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id");
--> statement-breakpoint
ALTER TABLE "schedule_runs" ADD CONSTRAINT "schedule_runs_shift_location_fk" FOREIGN KEY ("production_shift_id", "location_id") REFERENCES "public"."production_shifts"("id", "location_id");
--> statement-breakpoint
ALTER TABLE "schedule_runs" ADD CONSTRAINT "schedule_runs_config_location_fk" FOREIGN KEY ("scheduler_config_id", "location_id") REFERENCES "public"."scheduler_configs"("id", "location_id");
--> statement-breakpoint
ALTER TABLE "stage_machine_assignments" ADD CONSTRAINT "stage_machine_assignments_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id");
--> statement-breakpoint
ALTER TABLE "stage_machine_assignments" ADD CONSTRAINT "stage_machine_assignments_stage_location_fk" FOREIGN KEY ("stage_run_id", "location_id") REFERENCES "public"."stage_runs"("id", "location_id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "stage_machine_assignments" ADD CONSTRAINT "stage_machine_assignments_machine_location_fk" FOREIGN KEY ("machine_id", "location_id") REFERENCES "public"."production_machines"("id", "location_id");
--> statement-breakpoint
ALTER TABLE "stage_runs" ADD CONSTRAINT "stage_runs_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id");
--> statement-breakpoint
ALTER TABLE "stage_runs" ADD CONSTRAINT "stage_runs_batch_location_fk" FOREIGN KEY ("production_batch_id", "location_id") REFERENCES "public"."production_batches"("id", "location_id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "stage_runs" ADD CONSTRAINT "stage_runs_station_location_fk" FOREIGN KEY ("station_id", "location_id") REFERENCES "public"."production_stations"("id", "location_id");
