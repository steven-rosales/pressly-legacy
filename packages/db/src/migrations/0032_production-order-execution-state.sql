ALTER TABLE "production_orders" ADD COLUMN "execution_status" text;--> statement-breakpoint
UPDATE "production_orders"
SET "execution_status" = CASE
  WHEN "status" = 'finished' THEN 'finished'
  WHEN "status" = 'scheduled' THEN 'scheduled'
  ELSE 'unassigned'
END
WHERE "execution_status" IS NULL;--> statement-breakpoint
ALTER TABLE "production_orders" ALTER COLUMN "execution_status" SET DEFAULT 'unassigned';--> statement-breakpoint
ALTER TABLE "production_orders" ALTER COLUMN "execution_status" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "production_orders_location_execution_status_idx" ON "production_orders" USING btree ("location_id","execution_status");--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_execution_status_valid" CHECK ("production_orders"."execution_status" in ('unassigned', 'scheduled', 'finished'));
