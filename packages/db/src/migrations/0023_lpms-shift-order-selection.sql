CREATE TABLE "production_shift_selected_orders" (
	"production_shift_id" uuid NOT NULL,
	"location_id" text NOT NULL,
	"production_order_id" uuid NOT NULL,
	"selected_by" uuid NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_shift_selected_orders_pk" PRIMARY KEY("production_shift_id","production_order_id")
);
--> statement-breakpoint
CREATE TABLE "production_shift_selections" (
	"production_shift_id" uuid PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"selected_by" uuid NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_shift_selections_positive_version" CHECK ("production_shift_selections"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "production_shift_selections_shift_location_unique" ON "production_shift_selections" USING btree ("production_shift_id","location_id");--> statement-breakpoint
ALTER TABLE "production_shift_selected_orders" ADD CONSTRAINT "production_shift_selected_orders_selection_fk" FOREIGN KEY ("production_shift_id","location_id") REFERENCES "public"."production_shift_selections"("production_shift_id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_shift_selected_orders" ADD CONSTRAINT "production_shift_selected_orders_order_location_fk" FOREIGN KEY ("production_order_id","location_id") REFERENCES "public"."production_orders"("id","location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_shift_selections" ADD CONSTRAINT "production_shift_selections_shift_location_fk" FOREIGN KEY ("production_shift_id","location_id") REFERENCES "public"."production_shifts"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_shift_selected_orders_location_shift_idx" ON "production_shift_selected_orders" USING btree ("location_id","production_shift_id");--> statement-breakpoint
UPDATE "production_orders" AS "production_order"
SET
	"status" = CASE "demand"."phase"
		WHEN 'expected' THEN 'release_pending'
		WHEN 'inbound' THEN 'release_pending'
		WHEN 'production_released' THEN CASE
			WHEN "production_order"."bag_count" IS NULL THEN 'intake_pending'
			ELSE 'eligible'
		END
		ELSE 'ineligible'
	END,
	"eligible_at" = CASE
		WHEN "demand"."phase" = 'production_released'
			AND "production_order"."bag_count" IS NOT NULL
			THEN coalesce("production_order"."eligible_at", now())
		ELSE NULL
	END,
	"version" = "production_order"."version" + 1,
	"updated_at" = now()
FROM "order_demands" AS "demand"
WHERE "demand"."id" = "production_order"."order_demand_id"
	AND "production_order"."status" NOT IN ('scheduled', 'finished');
--> statement-breakpoint
UPDATE "schedule_runs"
SET
	"status" = 'superseded',
	"superseded_at" = now()
WHERE "status" IN ('draft', 'accepted');
--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_status_valid" CHECK ("production_orders"."status" in ('release_pending', 'intake_pending', 'eligible', 'ineligible', 'scheduled', 'finished'));
