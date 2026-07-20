ALTER TABLE "order_demands" RENAME COLUMN "status" TO "phase";
--> statement-breakpoint
DROP INDEX "order_demands_location_status_idx";
--> statement-breakpoint
ALTER TABLE "production_orders" ALTER COLUMN "eligible_at" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_demands" ADD COLUMN "source_status_code" text;
--> statement-breakpoint
ALTER TABLE "order_demands" ADD COLUMN "estimated_weight_lbs" numeric(12, 3);
--> statement-breakpoint
ALTER TABLE "order_demands" ADD COLUMN "estimated_weight_source" text;
--> statement-breakpoint
UPDATE "order_demands"
SET
  "phase" = CASE
    WHEN "phase" = 'ready_for_production' THEN 'production_released'
    ELSE 'expected'
  END,
  "source_status_code" = CASE
    WHEN "phase" = 'ready_for_production' THEN 'LEGACY_IN_PROGRESS'
    ELSE 'LEGACY_UNKNOWN'
  END;
--> statement-breakpoint
WITH "latest_cents_receipt" AS (
  SELECT DISTINCT ON ("subject_id")
    "subject_id",
    "payload_json"
  FROM "webhook_events"
  WHERE "source" = 'cents'
    AND "subject_type" = 'order'
    AND "status" = 'processed'
    AND "subject_id" IS NOT NULL
    AND jsonb_typeof("payload_json") = 'object'
    AND jsonb_typeof("payload_json"->'services') = 'array'
    AND "payload_json"->>'status' IS NOT NULL
  ORDER BY
    "subject_id",
    "source_occurred_at" DESC NULLS LAST,
    "received_at" DESC,
    "id" DESC
),
"cents_backfill" AS (
  SELECT
    "subject_id",
    "payload_json"->>'status' AS "source_status_code",
    CASE "payload_json"->>'status'
      WHEN 'SUBMITTED' THEN 'expected'
      WHEN 'READY_FOR_PICKUP' THEN 'expected'
      WHEN 'PICKED_UP' THEN 'inbound'
      WHEN 'IN_PROGRESS' THEN 'production_released'
      WHEN 'READY_FOR_RETURN' THEN 'post_production'
      WHEN 'OUT_FOR_DELIVERY' THEN 'post_production'
      WHEN 'COMPLETED' THEN 'post_production'
      WHEN 'CANCELED' THEN 'withdrawn'
      WHEN 'CANCELLED' THEN 'withdrawn'
      ELSE NULL
    END AS "phase",
    (
      SELECT round(sum(
        ("service"->>'totalPriceCents')::numeric /
        nullif(("service"->>'unitPriceCents')::numeric, 0)
      ), 3)
      FROM jsonb_array_elements("payload_json"->'services') AS "service"
      WHERE jsonb_typeof("service"->'totalPriceCents') = 'number'
        AND jsonb_typeof("service"->'unitPriceCents') = 'number'
    ) AS "estimated_weight_lbs"
  FROM "latest_cents_receipt"
)
UPDATE "order_demands" AS "demand"
SET
  "phase" = coalesce("backfill"."phase", "demand"."phase"),
  "source_status_code" = "backfill"."source_status_code",
  "estimated_weight_lbs" = CASE
    WHEN "backfill"."estimated_weight_lbs" > 0
      THEN "backfill"."estimated_weight_lbs"
    ELSE NULL
  END,
  "estimated_weight_source" = CASE
    WHEN "backfill"."estimated_weight_lbs" > 0
      THEN 'external_estimate'
    ELSE NULL
  END
FROM "cents_backfill" AS "backfill"
WHERE "demand"."demand_key" = 'cents:order:' || "backfill"."subject_id";
--> statement-breakpoint
UPDATE "order_demands" AS "demand"
SET
  "estimated_weight_lbs" = "production_order"."derived_weight_lbs",
  "estimated_weight_source" = "production_order"."derived_weight_source"
FROM "production_orders" AS "production_order"
WHERE "production_order"."order_demand_id" = "demand"."id";
--> statement-breakpoint
ALTER TABLE "order_demands" ALTER COLUMN "source_status_code" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX "order_demands_location_phase_idx" ON "order_demands" USING btree ("location_id", "phase");
--> statement-breakpoint
ALTER TABLE "order_demands" ADD CONSTRAINT "order_demands_phase_valid" CHECK ("order_demands"."phase" in ('expected', 'inbound', 'production_released', 'post_production', 'withdrawn'));
--> statement-breakpoint
ALTER TABLE "order_demands" ADD CONSTRAINT "order_demands_estimated_weight_positive" CHECK ("order_demands"."estimated_weight_lbs" is null or "order_demands"."estimated_weight_lbs" > 0);
--> statement-breakpoint
ALTER TABLE "order_demands" ADD CONSTRAINT "order_demands_estimated_weight_provenance_consistent" CHECK (("order_demands"."estimated_weight_lbs" is null) = ("order_demands"."estimated_weight_source" is null));
