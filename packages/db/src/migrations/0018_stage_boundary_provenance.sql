CREATE TYPE "public"."stage_boundary_provenance" AS ENUM('live_observed', 'operator_reported', 'not_recorded');--> statement-breakpoint
ALTER TABLE "stage_runs" ADD COLUMN "actual_start_provenance" "stage_boundary_provenance" DEFAULT 'not_recorded' NOT NULL;--> statement-breakpoint
ALTER TABLE "stage_runs" ADD COLUMN "actual_end_provenance" "stage_boundary_provenance" DEFAULT 'not_recorded' NOT NULL;--> statement-breakpoint
UPDATE "stage_runs"
SET "actual_start_provenance" = 'live_observed'
WHERE "actual_start_at" IS NOT NULL;--> statement-breakpoint
UPDATE "stage_runs"
SET "actual_end_provenance" = 'live_observed'
WHERE "actual_end_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "stage_runs" ADD CONSTRAINT "stage_runs_actual_start_provenance_valid" CHECK (("stage_runs"."actual_start_at" is null and "stage_runs"."actual_start_provenance" = 'not_recorded') or ("stage_runs"."actual_start_at" is not null and "stage_runs"."actual_start_provenance" in ('live_observed', 'operator_reported')));--> statement-breakpoint
ALTER TABLE "stage_runs" ADD CONSTRAINT "stage_runs_actual_end_provenance_valid" CHECK (("stage_runs"."actual_end_at" is null and "stage_runs"."actual_end_provenance" = 'not_recorded') or ("stage_runs"."actual_end_at" is not null and "stage_runs"."actual_end_provenance" in ('live_observed', 'operator_reported')));--> statement-breakpoint
ALTER TABLE "stage_runs" ADD CONSTRAINT "stage_runs_actual_window_valid" CHECK ("stage_runs"."actual_start_at" is null or "stage_runs"."actual_end_at" is null or "stage_runs"."actual_end_at" >= "stage_runs"."actual_start_at");
