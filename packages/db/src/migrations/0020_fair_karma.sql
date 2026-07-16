CREATE TABLE "production_order_stage_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"production_run_id" uuid NOT NULL,
	"production_order_id" uuid NOT NULL,
	"stage_run_id" uuid NOT NULL,
	"stage_kind" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"assignment_reason" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"released_at" timestamp with time zone,
	"released_by" uuid,
	"release_reason" text,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_order_stage_attempts_known_stage" CHECK ("production_order_stage_attempts"."stage_kind" in ('sorting', 'washing', 'drying', 'folding_packaging')),
	CONSTRAINT "production_order_stage_attempts_positive_number" CHECK ("production_order_stage_attempts"."attempt_number" > 0),
	CONSTRAINT "production_order_stage_attempts_known_status" CHECK ("production_order_stage_attempts"."status" in ('assigned', 'completed', 'released')),
	CONSTRAINT "production_order_stage_attempts_known_assignment_reason" CHECK ("production_order_stage_attempts"."assignment_reason" in ('initial_schedule', 'automatic', 'manager_exact', 'manual_rebatch', 'needs_more_drying', 'rewash_required', 'sorting_incomplete', 'stage_incomplete', 'other')),
	CONSTRAINT "production_order_stage_attempts_lifecycle_valid" CHECK (("production_order_stage_attempts"."status" = 'assigned' and "production_order_stage_attempts"."completed_at" is null and "production_order_stage_attempts"."completed_by" is null and "production_order_stage_attempts"."released_at" is null and "production_order_stage_attempts"."released_by" is null and "production_order_stage_attempts"."release_reason" is null) or ("production_order_stage_attempts"."status" = 'completed' and "production_order_stage_attempts"."completed_at" is not null and "production_order_stage_attempts"."released_at" is null and "production_order_stage_attempts"."released_by" is null and "production_order_stage_attempts"."release_reason" is null) or ("production_order_stage_attempts"."status" = 'released' and "production_order_stage_attempts"."completed_at" is null and "production_order_stage_attempts"."completed_by" is null and "production_order_stage_attempts"."released_at" is not null and "production_order_stage_attempts"."released_by" is not null and "production_order_stage_attempts"."release_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "production_batch_orders" DROP CONSTRAINT "production_batch_orders_known_placement_provenance";--> statement-breakpoint
ALTER TABLE "production_batch_orders" DROP CONSTRAINT "production_batch_orders_pin_valid";--> statement-breakpoint
ALTER TABLE "production_batch_orders" DROP CONSTRAINT "production_batch_orders_production_batch_id_production_order_id_pk";--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD COLUMN "placed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD COLUMN "placed_by" uuid;--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD COLUMN "released_by" uuid;--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD COLUMN "release_reason" text;--> statement-breakpoint
UPDATE "production_batch_orders" AS membership
SET "placed_at" = COALESCE(batch."created_at", membership."placed_at")
FROM "production_batches" AS batch
WHERE batch."id" = membership."production_batch_id"
  AND batch."location_id" = membership."location_id";--> statement-breakpoint
ALTER TABLE "production_order_stage_attempts" ADD CONSTRAINT "production_order_stage_attempts_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_stage_attempts" ADD CONSTRAINT "production_order_stage_attempts_run_location_fk" FOREIGN KEY ("production_run_id","location_id") REFERENCES "public"."production_runs"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_stage_attempts" ADD CONSTRAINT "production_order_stage_attempts_order_location_fk" FOREIGN KEY ("production_order_id","location_id") REFERENCES "public"."production_orders"("id","location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_stage_attempts" ADD CONSTRAINT "production_order_stage_attempts_stage_location_fk" FOREIGN KEY ("stage_run_id","location_id") REFERENCES "public"."stage_runs"("id","location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "stage_runs"
    WHERE "status" = 'completed'
      AND "actual_end_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill order routes: completed stage has no actual completion boundary';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "production_batch_orders" AS membership
    JOIN "stage_runs" AS stage
      ON stage."production_batch_id" = membership."production_batch_id"
     AND stage."location_id" = membership."location_id"
    WHERE membership."active" = false
      AND stage."status" <> 'completed'
  ) THEN
    RAISE EXCEPTION 'Cannot backfill order routes: inactive batch membership has unfinished stage work';
  END IF;
END
$$;--> statement-breakpoint
INSERT INTO "production_order_stage_attempts" (
  "id",
  "location_id",
  "production_run_id",
  "production_order_id",
  "stage_run_id",
  "stage_kind",
  "attempt_number",
  "status",
  "assignment_reason",
  "assigned_at",
  "assigned_by",
  "completed_at",
  "completed_by",
  "metadata_json",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  membership."location_id",
  batch."production_run_id",
  membership."production_order_id",
  stage."id",
  stage."stage_kind",
  row_number() OVER (
    PARTITION BY membership."production_order_id", stage."stage_kind"
    ORDER BY membership."placed_at", batch."sequence_index", membership."production_batch_id"
  ),
  CASE WHEN stage."status" = 'completed' THEN 'completed' ELSE 'assigned' END,
  CASE
    WHEN membership."placement_provenance" = 'automatic' THEN 'automatic'
    WHEN membership."placement_provenance" = 'manager_exact' THEN 'manager_exact'
    ELSE 'initial_schedule'
  END,
  membership."placed_at",
  membership."placed_by",
  CASE WHEN stage."status" = 'completed' THEN stage."actual_end_at" END,
  CASE WHEN stage."status" = 'completed' THEN stage."completed_by" END,
  '{"backfilled":true}'::jsonb,
  membership."placed_at",
  GREATEST(membership."placed_at", COALESCE(stage."actual_end_at", membership."placed_at"))
FROM "production_batch_orders" AS membership
JOIN "production_batches" AS batch
  ON batch."id" = membership."production_batch_id"
 AND batch."location_id" = membership."location_id"
JOIN "stage_runs" AS stage
  ON stage."production_batch_id" = batch."id"
 AND stage."location_id" = batch."location_id";--> statement-breakpoint
CREATE UNIQUE INDEX "production_order_stage_attempts_order_stage_number_unique" ON "production_order_stage_attempts" USING btree ("production_order_id","stage_kind","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "production_order_stage_attempts_one_assigned_unique" ON "production_order_stage_attempts" USING btree ("production_order_id","stage_kind") WHERE "production_order_stage_attempts"."status" = 'assigned';--> statement-breakpoint
CREATE INDEX "production_order_stage_attempts_stage_idx" ON "production_order_stage_attempts" USING btree ("stage_run_id","status");--> statement-breakpoint
CREATE INDEX "production_order_stage_attempts_order_idx" ON "production_order_stage_attempts" USING btree ("production_order_id","assigned_at");--> statement-breakpoint
CREATE INDEX "production_batch_orders_order_history_idx" ON "production_batch_orders" USING btree ("production_order_id","placed_at");--> statement-breakpoint
CREATE INDEX "production_orders_location_due_id_idx" ON "production_orders" USING btree ("location_id","due_at","id");--> statement-breakpoint
CREATE INDEX "work_events_location_created_id_idx" ON "work_events" USING btree ("location_id","created_at","id");--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD CONSTRAINT "production_batch_orders_release_valid" CHECK (("production_batch_orders"."released_at" is null and "production_batch_orders"."released_by" is null and "production_batch_orders"."release_reason" is null) or ("production_batch_orders"."active" = false and "production_batch_orders"."released_at" is not null and "production_batch_orders"."released_by" is not null and "production_batch_orders"."release_reason" is not null));--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD CONSTRAINT "production_batch_orders_known_placement_provenance" CHECK ("production_batch_orders"."placement_provenance" in ('initial_schedule', 'automatic', 'manager_exact', 'manual_rebatch', 'exception_route'));--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD CONSTRAINT "production_batch_orders_pin_valid" CHECK (("production_batch_orders"."placement_provenance" in ('manager_exact', 'manual_rebatch') and "production_batch_orders"."pinned_at" is not null and "production_batch_orders"."pinned_by" is not null) or ("production_batch_orders"."placement_provenance" not in ('manager_exact', 'manual_rebatch') and "production_batch_orders"."pinned_at" is null and "production_batch_orders"."pinned_by" is null));
