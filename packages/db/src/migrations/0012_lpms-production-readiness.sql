CREATE TABLE "cents_store_locations" (
	"store_id" text PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "production_locations" ("id", "name", "timezone", "is_active")
VALUES ('__legacy_unmapped__', 'Legacy unmapped', 'UTC', false)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "production_locations" ("id", "name", "timezone", "is_active")
SELECT DISTINCT ON ("location_id")
  "location_id",
  "location_id",
  "timezone",
  true
FROM "production_shifts"
ORDER BY "location_id", "created_at" DESC
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "production_locations" ("id", "name", "timezone", "is_active")
SELECT DISTINCT
  "location_id",
  "location_id",
  'UTC',
  false
FROM "production_stations"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "crm_orders" RENAME COLUMN "vendor_updated_at" TO "source_updated_at";--> statement-breakpoint
ALTER TABLE "webhook_events" RENAME COLUMN "event_type" TO "event_kind";--> statement-breakpoint
ALTER TABLE "webhook_events" RENAME COLUMN "external_event_id" TO "dedupe_key";--> statement-breakpoint
ALTER TABLE "webhook_events" RENAME COLUMN "payload_hash" TO "canonical_payload_hash";--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "canonical_payload_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_orders" DROP CONSTRAINT "crm_orders_source_version_nonnegative";--> statement-breakpoint
ALTER TABLE "crm_orders" DROP CONSTRAINT "crm_orders_bag_count_nonnegative";--> statement-breakpoint
ALTER TABLE "webhook_events" DROP CONSTRAINT "webhook_events_source_version_nonnegative";--> statement-breakpoint
DROP INDEX "scheduler_configs_version_unique";--> statement-breakpoint
DROP INDEX "webhook_events_external_event_unique";--> statement-breakpoint
ALTER TABLE "crm_orders" ADD COLUMN "location_id" text;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "location_id" text;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "bag_count" integer;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "bag_count_source" text;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "intake_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "intake_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduler_configs" ADD COLUMN "location_id" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "vendor" text DEFAULT 'cents' NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "classification" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "external_entity_id" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "external_order_id" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "external_store_id" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "source_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "canonical_payload" jsonb;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "raw_body_sha256" text;--> statement-breakpoint
ALTER TABLE "work_events" ADD COLUMN "location_id" text;--> statement-breakpoint
UPDATE "crm_orders"
SET "location_id" = '__legacy_unmapped__';
--> statement-breakpoint
UPDATE "production_orders"
SET
  "location_id" = '__legacy_unmapped__',
  "status" = CASE
    WHEN "status" = 'eligible' THEN 'intake_pending'
    ELSE "status"
  END;
--> statement-breakpoint
UPDATE "scheduler_configs"
SET "location_id" = '__legacy_unmapped__';
--> statement-breakpoint
UPDATE "work_events"
SET "location_id" = '__legacy_unmapped__';
--> statement-breakpoint
UPDATE "webhook_events"
SET
  "classification" = 'order',
  "external_entity_id" = "payload"->'order'->>'externalOrderId',
  "external_order_id" = "payload"->'order'->>'externalOrderId',
  "source_updated_at" = CASE
    WHEN "payload"->'order'->>'updatedAt' IS NOT NULL
      THEN ("payload"->'order'->>'updatedAt')::timestamptz
    ELSE NULL
  END,
  "raw_body_sha256" = 'legacy-unavailable',
  "status" = CASE
    WHEN "status" = 'processed' THEN 'processed'
    ELSE 'dead'
  END,
  "last_error_code" = CASE
    WHEN "status" = 'processed' THEN "last_error_code"
    ELSE 'LEGACY_RECEIPT_REQUIRES_SIGNED_REPLAY'
  END,
  "last_error_message" = CASE
    WHEN "status" = 'processed' THEN "last_error_message"
    ELSE 'Legacy receipt did not preserve an authenticated raw-body digest.'
  END;
--> statement-breakpoint
ALTER TABLE "crm_orders" ALTER COLUMN "location_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "production_orders" ALTER COLUMN "location_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduler_configs" ALTER COLUMN "location_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "classification" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "raw_body_sha256" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "work_events" ALTER COLUMN "location_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cents_store_locations" ADD CONSTRAINT "cents_store_locations_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cents_store_locations_location_idx" ON "cents_store_locations" USING btree ("location_id");--> statement-breakpoint
ALTER TABLE "crm_orders" ADD CONSTRAINT "crm_orders_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_shifts" ADD CONSTRAINT "production_shifts_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduler_configs" ADD CONSTRAINT "scheduler_configs_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stations" ADD CONSTRAINT "production_stations_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_events" ADD CONSTRAINT "work_events_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_orders_location_status_idx" ON "crm_orders" USING btree ("location_id","status");--> statement-breakpoint
CREATE INDEX "production_orders_location_status_idx" ON "production_orders" USING btree ("location_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduler_configs_location_version_unique" ON "scheduler_configs" USING btree ("location_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_dedupe_unique" ON "webhook_events" USING btree ("vendor","dedupe_key");--> statement-breakpoint
ALTER TABLE "crm_orders" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "crm_orders" DROP COLUMN "bag_count";--> statement-breakpoint
ALTER TABLE "webhook_events" DROP COLUMN "source_version";--> statement-breakpoint
ALTER TABLE "webhook_events" DROP COLUMN "payload";--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_bag_count_valid" CHECK ("production_orders"."bag_count" is null or "production_orders"."bag_count" >= 0);--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_intake_version_nonnegative" CHECK ("production_orders"."intake_version" >= 0);--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_known_classification" CHECK ("webhook_events"."classification" in ('order', 'customer', 'marketing', 'unknown'));
