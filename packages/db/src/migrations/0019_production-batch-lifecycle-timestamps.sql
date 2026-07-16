DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "production_batches"
    WHERE
      ("status" = 'queued' AND ("started_at" IS NOT NULL OR "finished_at" IS NOT NULL))
      OR ("status" = 'finished' AND "finished_at" IS NULL)
      OR ("status" <> 'finished' AND "finished_at" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'LPMS_BATCH_LIFECYCLE_MIGRATION_INCONSISTENT_TIMESTAMPS';
  END IF;
END $$;
--> statement-breakpoint
-- Historical non-queued rows may be
-- missing started_at. membership_frozen_at (or updated_at as a legacy
-- fallback) is an existing LPMS lifecycle anchor, not a reconstructed physical
-- stage-start timestamp.
UPDATE "production_batches"
SET "started_at" = COALESCE("membership_frozen_at", "updated_at")
WHERE "status" <> 'queued' AND "started_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_lifecycle_timestamps_valid" CHECK (("production_batches"."status" = 'queued' and "production_batches"."started_at" is null and "production_batches"."finished_at" is null) or ("production_batches"."status" <> 'queued' and "production_batches"."started_at" is not null and (("production_batches"."status" = 'finished') = ("production_batches"."finished_at" is not null))));
