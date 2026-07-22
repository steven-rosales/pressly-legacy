ALTER TABLE "order_demands" ADD COLUMN "fulfillment_id" uuid;--> statement-breakpoint
ALTER TABLE "order_demands" ADD COLUMN "fulfillment_version" integer;--> statement-breakpoint
ALTER TABLE "order_demands" ADD COLUMN "projection_hash" text;--> statement-breakpoint
ALTER TABLE "order_demands" ADD COLUMN "admission_state" text;--> statement-breakpoint
ALTER TABLE "order_demands" ADD COLUMN "commercial_state" text;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "order_demands" AS demand
    JOIN "orders" AS canonical ON canonical."id" = demand."id"
  ) THEN
    RAISE EXCEPTION 'SOURCE_NEUTRAL_DEMAND_BACKFILL_ORDER_ID_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "order_demands" AS demand
    JOIN "order_fulfillments" AS fulfillment
      ON fulfillment."id" = demand."id"
  ) THEN
    RAISE EXCEPTION 'SOURCE_NEUTRAL_DEMAND_BACKFILL_FULFILLMENT_ID_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "order_demands" AS demand
    JOIN "order_source_links" AS source_link
      ON source_link."id" = demand."id"
  ) THEN
    RAISE EXCEPTION 'SOURCE_NEUTRAL_DEMAND_BACKFILL_SOURCE_LINK_ID_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "order_demands" AS demand
    JOIN "order_source_links" AS source_link
      ON source_link."source" = CASE
        WHEN demand."demand_key" LIKE 'cents:order:%' THEN 'cents'
        ELSE 'legacy_lpms'
      END
     AND source_link."external_order_id" = CASE
       WHEN demand."demand_key" LIKE 'cents:order:%'
         THEN substring(demand."demand_key" FROM length('cents:order:') + 1)
       ELSE demand."demand_key"
     END
  ) THEN
    RAISE EXCEPTION 'SOURCE_NEUTRAL_DEMAND_BACKFILL_SOURCE_LINK_CONFLICT';
  END IF;
END
$$;--> statement-breakpoint

INSERT INTO "orders" (
  "id",
  "customer_user_id",
  "customer_resolution",
  "display_number",
  "state",
  "due_at",
  "currency",
  "total_amount_cents",
  "balance_due_cents",
  "version",
  "created_at",
  "updated_at"
)
SELECT
  demand."id",
  NULL,
  'legacy_unknown',
  NULL,
  CASE
    WHEN demand."source_status_code" = 'COMPLETED' THEN 'completed'
    WHEN demand."source_status_code" IN ('CANCELED', 'CANCELLED') THEN 'canceled'
    ELSE 'open'
  END,
  demand."due_at",
  'USD',
  0,
  NULL,
  1,
  demand."created_at",
  demand."updated_at"
FROM "order_demands" AS demand;--> statement-breakpoint

INSERT INTO "order_fulfillments" (
  "id",
  "order_id",
  "type_code",
  "location_id",
  "release_state",
  "estimated_weight_lbs",
  "estimated_weight_source",
  "bag_count",
  "version",
  "created_at",
  "updated_at"
)
SELECT
  demand."id",
  demand."id",
  'wash_fold',
  demand."location_id",
  CASE
    WHEN demand."phase" = 'withdrawn' THEN 'withdrawn'
    WHEN demand."phase" IN ('production_released', 'post_production') THEN 'released'
    ELSE 'unreleased'
  END,
  demand."estimated_weight_lbs",
  demand."estimated_weight_source",
  production_order."bag_count",
  1,
  demand."created_at",
  demand."updated_at"
FROM "order_demands" AS demand
LEFT JOIN "production_orders" AS production_order
  ON production_order."order_demand_id" = demand."id";--> statement-breakpoint

INSERT INTO "order_source_links" (
  "id",
  "source",
  "external_order_id",
  "order_id",
  "created_at",
  "updated_at"
)
SELECT
  demand."id",
  CASE
    WHEN demand."demand_key" LIKE 'cents:order:%' THEN 'cents'
    ELSE 'legacy_lpms'
  END,
  CASE
    WHEN demand."demand_key" LIKE 'cents:order:%'
      THEN substring(demand."demand_key" FROM length('cents:order:') + 1)
    ELSE demand."demand_key"
  END,
  demand."id",
  demand."created_at",
  demand."updated_at"
FROM "order_demands" AS demand;--> statement-breakpoint

INSERT INTO "order_source_customer_refs" (
  "order_source_link_id",
  "external_user_id",
  "resolved_user_id",
  "resolution",
  "observed_at",
  "updated_at"
)
SELECT
  demand."id",
  NULL,
  NULL,
  'legacy_unknown',
  demand."updated_at",
  demand."updated_at"
FROM "order_demands" AS demand;--> statement-breakpoint

INSERT INTO "order_source_snapshots" (
  "source_link_id",
  "source_revision_at",
  "source_revision_hash",
  "adapter_version",
  "normalized_payload_json",
  "observed_at",
  "created_at",
  "updated_at"
)
SELECT
  demand."id",
  demand."revision_at",
  CASE
    WHEN demand."revision_hash" ~ '^[a-f0-9]{64}$' THEN demand."revision_hash"
    ELSE encode(sha256(convert_to(demand."revision_hash", 'UTF8')), 'hex')
  END,
  'legacy-production-v1',
  COALESCE(
    (
      SELECT webhook."payload_json"
      FROM "webhook_events" AS webhook
      WHERE webhook."source" = 'cents'
        AND demand."demand_key" LIKE 'cents:order:%'
        AND webhook."subject_id" = substring(
          demand."demand_key" FROM length('cents:order:') + 1
        )
        AND webhook."payload_json" IS NOT NULL
      ORDER BY webhook."received_at" DESC
      LIMIT 1
    ),
    jsonb_build_object(
      'legacyBackfill', true,
      'legacyDemandKey', demand."demand_key",
      'legacyDisplayReference', demand."display_reference"
    )
  ),
  demand."updated_at",
  demand."created_at",
  demand."updated_at"
FROM "order_demands" AS demand;--> statement-breakpoint

INSERT INTO "order_field_authorities" (
  "order_id",
  "field_name",
  "authority",
  "source",
  "updated_at"
)
SELECT
  demand."id",
  fields."field_name",
  CASE
    WHEN demand."demand_key" LIKE 'cents:order:%' THEN 'source'
    ELSE 'pressly'
  END,
  CASE
    WHEN demand."demand_key" LIKE 'cents:order:%' THEN 'cents'
    ELSE NULL
  END,
  demand."updated_at"
FROM "order_demands" AS demand
CROSS JOIN (
  VALUES
    ('customer'),
    ('displayNumber'),
    ('state'),
    ('dueAt'),
    ('currency'),
    ('totalAmountCents'),
    ('balanceDueCents'),
    ('fulfillment:wash_fold:releaseState')
) AS fields("field_name");--> statement-breakpoint

UPDATE "order_demands" AS demand
SET
  "fulfillment_id" = demand."id",
  "fulfillment_version" = 1,
  "projection_hash" = CASE
    WHEN demand."revision_hash" ~ '^[a-f0-9]{64}$' THEN demand."revision_hash"
    ELSE encode(sha256(convert_to(demand."revision_hash", 'UTF8')), 'hex')
  END,
  "admission_state" = CASE
    WHEN demand."phase" = 'withdrawn' THEN 'withdrawn'
    WHEN demand."phase" IN ('production_released', 'post_production') THEN 'released'
    ELSE 'unreleased'
  END,
  "commercial_state" = CASE
    WHEN demand."source_status_code" = 'COMPLETED' THEN 'completed'
    WHEN demand."source_status_code" IN ('CANCELED', 'CANCELLED') THEN 'canceled'
    ELSE 'open'
  END;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "order_demands"
    WHERE "fulfillment_id" IS NULL
       OR "fulfillment_version" IS NULL
       OR "projection_hash" IS NULL
       OR "admission_state" IS NULL
       OR "commercial_state" IS NULL
  ) THEN
    RAISE EXCEPTION 'SOURCE_NEUTRAL_DEMAND_BACKFILL_INCOMPLETE';
  END IF;
END
$$;--> statement-breakpoint

ALTER TABLE "order_demands" ALTER COLUMN "fulfillment_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_demands" ALTER COLUMN "fulfillment_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_demands" ALTER COLUMN "projection_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_demands" ALTER COLUMN "admission_state" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_demands" ALTER COLUMN "commercial_state" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_demands" ADD CONSTRAINT "order_demands_fulfillment_id_order_fulfillments_id_fk" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."order_fulfillments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_demands_fulfillment_unique" ON "order_demands" USING btree ("fulfillment_id");--> statement-breakpoint
ALTER TABLE "order_demands" ADD CONSTRAINT "order_demands_fulfillment_version_positive" CHECK ("order_demands"."fulfillment_version" > 0);--> statement-breakpoint
ALTER TABLE "order_demands" ADD CONSTRAINT "order_demands_projection_hash_shape" CHECK ("order_demands"."projection_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "order_demands" ADD CONSTRAINT "order_demands_admission_state_valid" CHECK ("order_demands"."admission_state" in ('unreleased', 'released', 'withdrawn'));--> statement-breakpoint
ALTER TABLE "order_demands" ADD CONSTRAINT "order_demands_commercial_state_valid" CHECK ("order_demands"."commercial_state" in ('open', 'completed', 'canceled'));
