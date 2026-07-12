ALTER TABLE "webhook_events" DROP CONSTRAINT "webhook_events_known_classification";
--> statement-breakpoint
ALTER TABLE "webhook_events" RENAME COLUMN "vendor" TO "source";
--> statement-breakpoint
ALTER TABLE "webhook_events" RENAME COLUMN "event_kind" TO "event_type";
--> statement-breakpoint
ALTER TABLE "webhook_events" RENAME COLUMN "classification" TO "subject_type";
--> statement-breakpoint
ALTER TABLE "webhook_events" RENAME COLUMN "external_entity_id" TO "subject_id";
--> statement-breakpoint
ALTER TABLE "webhook_events" RENAME COLUMN "external_store_id" TO "source_location_id";
--> statement-breakpoint
ALTER TABLE "webhook_events" RENAME COLUMN "source_updated_at" TO "source_occurred_at";
--> statement-breakpoint
ALTER TABLE "webhook_events" RENAME COLUMN "canonical_payload" TO "payload_json";
--> statement-breakpoint
ALTER TABLE "webhook_events" RENAME COLUMN "canonical_payload_hash" TO "payload_hash";
--> statement-breakpoint
ALTER TABLE "webhook_events" DROP COLUMN "external_order_id";
--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "source" DROP DEFAULT;

--> statement-breakpoint
ALTER TABLE "cents_store_locations" RENAME TO "source_location_bindings";
--> statement-breakpoint
ALTER TABLE "source_location_bindings" RENAME COLUMN "store_id" TO "external_location_id";
--> statement-breakpoint
ALTER TABLE "source_location_bindings" ADD COLUMN "source" text DEFAULT 'cents' NOT NULL;
--> statement-breakpoint
ALTER TABLE "source_location_bindings" DROP CONSTRAINT "cents_store_locations_pkey";
--> statement-breakpoint
ALTER TABLE "source_location_bindings" ADD CONSTRAINT "source_location_bindings_source_external_location_id_pk" PRIMARY KEY("source", "external_location_id");
--> statement-breakpoint
ALTER TABLE "source_location_bindings" RENAME CONSTRAINT "cents_store_locations_location_id_production_locations_id_fk" TO "source_location_bindings_location_id_production_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "source_location_bindings" ALTER COLUMN "source" DROP DEFAULT;
--> statement-breakpoint
ALTER INDEX "cents_store_locations_location_idx" RENAME TO "source_location_bindings_location_idx";

--> statement-breakpoint
ALTER TABLE "crm_orders" RENAME TO "order_demands";
--> statement-breakpoint
ALTER TABLE "order_demands" RENAME COLUMN "external_order_id" TO "display_reference";
--> statement-breakpoint
ALTER TABLE "order_demands" RENAME COLUMN "source_payload_hash" TO "revision_hash";
--> statement-breakpoint
ALTER TABLE "order_demands" RENAME COLUMN "source_updated_at" TO "revision_at";
--> statement-breakpoint
ALTER TABLE "order_demands" ADD COLUMN "demand_key" text;
--> statement-breakpoint
ALTER TABLE "order_demands" RENAME CONSTRAINT "crm_orders_location_id_production_locations_id_fk" TO "order_demands_location_id_production_locations_id_fk";
--> statement-breakpoint
UPDATE "order_demands"
SET
  "demand_key" = 'cents:order:' || "display_reference",
  "status" = CASE
    WHEN "status" = 'IN_PROGRESS' THEN 'ready_for_production'
    ELSE 'not_ready'
  END;
--> statement-breakpoint
ALTER TABLE "order_demands" ALTER COLUMN "demand_key" SET NOT NULL;
--> statement-breakpoint
DROP INDEX "crm_orders_external_order_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "order_demands_demand_key_unique" ON "order_demands" USING btree ("demand_key");
--> statement-breakpoint
ALTER INDEX "crm_orders_id_location_unique" RENAME TO "order_demands_id_location_unique";
--> statement-breakpoint
ALTER INDEX "crm_orders_location_status_idx" RENAME TO "order_demands_location_status_idx";

--> statement-breakpoint
DROP TABLE "crm_order_services";

--> statement-breakpoint
ALTER TABLE "production_orders" RENAME COLUMN "crm_order_id" TO "order_demand_id";
--> statement-breakpoint
ALTER INDEX "production_orders_crm_order_unique" RENAME TO "production_orders_order_demand_unique";
--> statement-breakpoint
ALTER TABLE "production_orders" RENAME CONSTRAINT "production_orders_crm_location_fk" TO "production_orders_order_demand_location_fk";
--> statement-breakpoint
ALTER TABLE "production_orders" ALTER COLUMN "derived_weight_source" SET DEFAULT 'external_estimate';
--> statement-breakpoint
UPDATE "production_orders"
SET
  "derived_weight_source" = CASE
    WHEN "derived_weight_source" = 'cents_service_price' THEN 'external_estimate'
    ELSE "derived_weight_source"
  END,
  "bag_count_source" = CASE
    WHEN "bag_count_source" = 'cents' THEN 'external_source'
    ELSE "bag_count_source"
  END;
