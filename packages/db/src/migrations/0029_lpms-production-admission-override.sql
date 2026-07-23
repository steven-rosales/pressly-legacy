ALTER TABLE "production_orders" ADD COLUMN "admission_override" text;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "admission_override_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "admission_override_by" uuid;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_admission_override_consistent" CHECK ((
        "production_orders"."admission_override" is null
        and "production_orders"."admission_override_at" is null
        and "production_orders"."admission_override_by" is null
      ) or (
        "production_orders"."admission_override" is not null
        and "production_orders"."admission_override" = 'released'
        and "production_orders"."admission_override_at" is not null
        and "production_orders"."admission_override_by" is not null
      ));
