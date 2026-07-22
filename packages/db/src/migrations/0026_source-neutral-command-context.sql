ALTER TABLE "order_command_receipts" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "order_command_receipts" ADD COLUMN "actor_kind" text;--> statement-breakpoint
ALTER TABLE "order_command_receipts" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "user_command_receipts" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "user_command_receipts" ADD COLUMN "actor_kind" text;--> statement-breakpoint
ALTER TABLE "user_command_receipts" ADD COLUMN "actor_id" text;--> statement-breakpoint
UPDATE "order_command_receipts"
SET "origin" = 'legacy_unknown',
    "actor_kind" = 'system',
    "actor_id" = 'legacy-command-receipt'
WHERE "origin" IS NULL OR "actor_kind" IS NULL OR "actor_id" IS NULL;--> statement-breakpoint
UPDATE "user_command_receipts"
SET "origin" = 'legacy_unknown',
    "actor_kind" = 'system',
    "actor_id" = 'legacy-command-receipt'
WHERE "origin" IS NULL OR "actor_kind" IS NULL OR "actor_id" IS NULL;--> statement-breakpoint
ALTER TABLE "order_command_receipts" ALTER COLUMN "origin" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_command_receipts" ALTER COLUMN "actor_kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_command_receipts" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_command_receipts" ALTER COLUMN "origin" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_command_receipts" ALTER COLUMN "actor_kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_command_receipts" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_command_receipts" ADD CONSTRAINT "order_command_receipts_actor_kind_valid" CHECK ("order_command_receipts"."actor_kind" in ('human', 'service', 'system'));--> statement-breakpoint
ALTER TABLE "order_command_receipts" ADD CONSTRAINT "order_command_receipts_context_present" CHECK (length(trim("order_command_receipts"."origin")) > 0 and length(trim("order_command_receipts"."actor_id")) > 0);--> statement-breakpoint
ALTER TABLE "user_command_receipts" ADD CONSTRAINT "user_command_receipts_actor_kind_valid" CHECK ("user_command_receipts"."actor_kind" in ('human', 'service', 'system'));--> statement-breakpoint
ALTER TABLE "user_command_receipts" ADD CONSTRAINT "user_command_receipts_context_present" CHECK (length(trim("user_command_receipts"."origin")) > 0 and length(trim("user_command_receipts"."actor_id")) > 0);
