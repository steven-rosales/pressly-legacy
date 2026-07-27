ALTER TABLE "production_orders" ADD COLUMN "resolution_state" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "resolved_by" uuid;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "resolution_reason" text;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "resolution_note" text;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "resolution_bulk_operation_id" uuid;--> statement-breakpoint
CREATE INDEX "production_orders_location_resolution_due_id_idx" ON "production_orders" USING btree ("location_id","resolution_state","due_at","id");--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_resolution_state_valid" CHECK ("production_orders"."resolution_state" in ('open', 'resolved_without_production'));--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_resolution_reason_valid" CHECK ("production_orders"."resolution_reason" is null or "production_orders"."resolution_reason" in ('completed_outside_pressly', 'processor_not_in_use', 'duplicate_or_test', 'order_will_not_be_produced', 'other'));--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_resolution_metadata_consistent" CHECK ((
        "production_orders"."resolution_state" = 'open'
        and "production_orders"."resolved_at" is null
        and "production_orders"."resolved_by" is null
        and "production_orders"."resolution_reason" is null
        and "production_orders"."resolution_note" is null
        and "production_orders"."resolution_bulk_operation_id" is null
      ) or (
        "production_orders"."resolution_state" = 'resolved_without_production'
        and "production_orders"."resolved_at" is not null
        and "production_orders"."resolved_by" is not null
        and "production_orders"."resolution_reason" is not null
        and btrim("production_orders"."resolution_reason") <> ''
        and (
          (
            "production_orders"."resolution_reason" <> 'other'
            and (
              "production_orders"."resolution_note" is null
              or btrim("production_orders"."resolution_note") <> ''
            )
          )
          or (
            "production_orders"."resolution_reason" = 'other'
            and "production_orders"."resolution_note" is not null
            and btrim("production_orders"."resolution_note") <> ''
          )
        )
      ));
