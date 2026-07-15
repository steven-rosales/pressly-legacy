DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "production_runs"
    GROUP BY "production_shift_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'LPMS_RUN_CENTERED_MIGRATION_MULTIPLE_RUNS_PER_SHIFT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "production_runs" AS run
    WHERE
      run."status" NOT IN ('planned', 'started', 'completed')
      OR (run."status" = 'planned' AND (
        run."started_at" IS NOT NULL
        OR run."completed_at" IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM "production_batches" AS batch
          WHERE batch."production_run_id" = run."id"
            AND (
              batch."status" <> 'queued'
              OR batch."started_at" IS NOT NULL
              OR batch."finished_at" IS NOT NULL
              OR EXISTS (
                SELECT 1
                FROM "stage_runs" AS stage
                WHERE stage."production_batch_id" = batch."id"
                  AND (
                    stage."status" <> 'planned'
                    OR stage."actual_start_at" IS NOT NULL
                    OR stage."actual_end_at" IS NOT NULL
                    OR stage."started_by" IS NOT NULL
                    OR stage."completed_by" IS NOT NULL
                  )
              )
              OR EXISTS (
                SELECT 1
                FROM "stage_runs" AS stage
                JOIN "stage_machine_assignments" AS assignment
                  ON assignment."stage_run_id" = stage."id"
                WHERE stage."production_batch_id" = batch."id"
                  AND (
                    assignment."status" <> 'planned'
                    OR assignment."actual_start_at" IS NOT NULL
                    OR assignment."actual_end_at" IS NOT NULL
                  )
              )
            )
        )
      ))
      OR (run."status" = 'started' AND (
        run."started_at" IS NULL
        OR run."completed_at" IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM "production_batches" AS batch
          WHERE batch."production_run_id" = run."id"
            AND (
              batch."status" NOT IN (
                'queued', 'sorting', 'washing', 'drying',
                'folding_packaging', 'finished'
              )
              OR (batch."status" = 'queued' AND (
                batch."started_at" IS NOT NULL
                OR batch."finished_at" IS NOT NULL
              ))
              OR (batch."status" <> 'queued' AND batch."started_at" IS NULL)
              OR (batch."status" = 'finished' AND batch."finished_at" IS NULL)
              OR (batch."status" <> 'finished' AND batch."finished_at" IS NOT NULL)
              OR (batch."status" = 'queued' AND EXISTS (
                SELECT 1
                FROM "stage_runs" AS stage
                WHERE stage."production_batch_id" = batch."id"
                  AND stage."status" <> 'planned'
              ))
              OR (batch."status" <> 'queued' AND NOT EXISTS (
                SELECT 1
                FROM "stage_runs" AS stage
                WHERE stage."production_batch_id" = batch."id"
                  AND stage."status" <> 'planned'
              ))
            )
        )
      ))
      OR (run."status" = 'completed' AND (
        run."started_at" IS NULL
        OR run."completed_at" IS NULL
        OR EXISTS (
          SELECT 1
          FROM "production_batches" AS batch
          WHERE batch."production_run_id" = run."id"
            AND batch."status" <> 'finished'
        )
      ))
      OR (run."status" IN ('started', 'completed') AND EXISTS (
        SELECT 1
        FROM "production_batches" AS batch
        JOIN "stage_runs" AS stage
          ON stage."production_batch_id" = batch."id"
        WHERE batch."production_run_id" = run."id"
          AND (
            stage."status" NOT IN ('planned', 'started', 'completed')
            OR (stage."status" = 'planned' AND (
              stage."actual_start_at" IS NOT NULL
              OR stage."actual_end_at" IS NOT NULL
              OR stage."started_by" IS NOT NULL
              OR stage."completed_by" IS NOT NULL
            ))
            OR (stage."status" = 'started' AND (
              stage."actual_start_at" IS NULL
              OR stage."actual_end_at" IS NOT NULL
              OR stage."started_by" IS NULL
              OR stage."completed_by" IS NOT NULL
            ))
            OR (stage."status" = 'completed' AND (
              stage."actual_start_at" IS NULL
              OR stage."actual_end_at" IS NULL
              OR stage."started_by" IS NULL
              OR stage."completed_by" IS NULL
            ))
            OR (batch."status" = 'finished' AND stage."status" <> 'completed')
          )
      ))
      OR (run."status" IN ('started', 'completed') AND EXISTS (
        SELECT 1
        FROM "production_batches" AS batch
        JOIN "stage_runs" AS stage
          ON stage."production_batch_id" = batch."id"
        JOIN "stage_machine_assignments" AS assignment
          ON assignment."stage_run_id" = stage."id"
        WHERE batch."production_run_id" = run."id"
          AND (
            assignment."status" NOT IN ('planned', 'active', 'completed')
            OR (assignment."status" = 'planned' AND (
              assignment."actual_start_at" IS NOT NULL
              OR assignment."actual_end_at" IS NOT NULL
            ))
            OR (assignment."status" = 'active' AND (
              assignment."actual_start_at" IS NULL
              OR assignment."actual_end_at" IS NOT NULL
            ))
            OR (assignment."status" = 'completed' AND (
              assignment."actual_start_at" IS NULL
              OR assignment."actual_end_at" IS NULL
            ))
            OR (stage."status" = 'planned' AND assignment."status" <> 'planned')
            OR (stage."status" = 'started' AND assignment."status" <> 'active')
            OR (stage."status" = 'completed' AND assignment."status" <> 'completed')
          )
      ))
  ) THEN
    RAISE EXCEPTION 'LPMS_RUN_CENTERED_MIGRATION_INCONSISTENT_EXECUTION';
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX "schedule_runs_canonical_proposal_unique";
--> statement-breakpoint
ALTER TABLE "schedule_runs" ADD COLUMN "acknowledged_warning_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "schedule_runs" ADD COLUMN "accepted_by" uuid;
--> statement-breakpoint
ALTER TABLE "schedule_runs" ADD COLUMN "superseded_at" timestamp with time zone;
--> statement-breakpoint
WITH accepted_events AS (
  SELECT DISTINCT ON (resolved."schedule_run_id")
    resolved."schedule_run_id",
    resolved."actor_id",
    resolved."payload_json"
  FROM (
    SELECT
      CASE
        WHEN event."entity_type" = 'schedule_run' THEN event."entity_id"
        WHEN event."entity_type" = 'production_run' THEN run."schedule_run_id"
        ELSE NULL
      END AS "schedule_run_id",
      event."actor_id",
      event."payload_json",
      event."created_at",
      event."id"
    FROM "work_events" AS event
    LEFT JOIN "production_runs" AS run
      ON event."entity_type" = 'production_run'
      AND run."id" = event."entity_id"
    WHERE event."event_type" = 'schedule_accepted'
  ) AS resolved
  WHERE resolved."schedule_run_id" IS NOT NULL
  ORDER BY resolved."schedule_run_id", resolved."created_at" DESC, resolved."id" DESC
)
UPDATE "schedule_runs" AS schedule
SET
  "accepted_by" = accepted_event."actor_id",
  "acknowledged_warning_codes" = COALESCE(
    accepted_event."payload_json"->'acknowledgedWarningCodes',
    accepted_event."payload_json"->'_idempotency'->'command'->'payload'->'acknowledgedWarningCodes',
    '[]'::jsonb
  )
FROM accepted_events AS accepted_event
WHERE accepted_event."schedule_run_id" = schedule."id";
--> statement-breakpoint
UPDATE "schedule_runs" AS schedule
SET
  "status" = 'accepted',
  "accepted_at" = COALESCE(schedule."accepted_at", run."created_at")
FROM "production_runs" AS run
WHERE run."schedule_run_id" = schedule."id"
  AND run."status" = 'planned';
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "schedule_runs"
    WHERE "status" = 'accepted'
      AND ("accepted_at" IS NULL OR "accepted_by" IS NULL)
  ) THEN
    RAISE EXCEPTION 'LPMS_RUN_CENTERED_MIGRATION_ACCEPTANCE_ACTOR_MISSING';
  END IF;
END $$;
--> statement-breakpoint
WITH resolved_accept_events AS (
  SELECT
    event."id" AS "event_id",
    CASE
      WHEN event."entity_type" = 'schedule_run' THEN event."entity_id"
      WHEN event."entity_type" = 'production_run' THEN run."schedule_run_id"
      ELSE NULL
    END AS "schedule_run_id",
    event."created_at"
  FROM "work_events" AS event
  LEFT JOIN "production_runs" AS run
    ON event."entity_type" = 'production_run'
    AND run."id" = event."entity_id"
  WHERE event."event_type" = 'schedule_accepted'
)
UPDATE "work_events" AS event
SET
  "entity_type" = 'schedule_run',
  "entity_id" = schedule."id",
  "payload_json" = CASE
    WHEN event."payload_json" #>> '{_idempotency,version}' = '1' THEN
      jsonb_set(
        event."payload_json",
        '{_idempotency,result}',
        jsonb_build_object(
          'scheduleRunId', schedule."id",
          'productionShiftId', schedule."production_shift_id",
          'acceptedAt', to_char(
            COALESCE(schedule."accepted_at", resolved."created_at")
              AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ),
          'replayed', false
        ),
        true
      )
    ELSE event."payload_json"
  END
FROM resolved_accept_events AS resolved
JOIN "schedule_runs" AS schedule
  ON schedule."id" = resolved."schedule_run_id"
WHERE event."id" = resolved."event_id";
--> statement-breakpoint
UPDATE "production_orders" AS production_order
SET
  "status" = 'eligible',
  "version" = production_order."version" + 1,
  "updated_at" = now()
WHERE production_order."status" = 'scheduled'
  AND EXISTS (
    SELECT 1
    FROM "production_batch_orders" AS batch_order
    JOIN "production_batches" AS batch
      ON batch."id" = batch_order."production_batch_id"
    JOIN "production_runs" AS run
      ON run."id" = batch."production_run_id"
    WHERE batch_order."production_order_id" = production_order."id"
      AND batch_order."active" = true
      AND run."status" = 'planned'
  );
--> statement-breakpoint
DELETE FROM "production_runs" WHERE "status" = 'planned';
--> statement-breakpoint
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "production_shift_id"
      ORDER BY "created_at" DESC, "id" DESC
    ) AS ordinal
  FROM "schedule_runs"
  WHERE "status" IN ('draft', 'accepted')
)
UPDATE "schedule_runs" AS schedule
SET "status" = 'superseded', "superseded_at" = now()
FROM ranked
WHERE schedule."id" = ranked."id" AND ranked.ordinal > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_runs_one_current_per_shift_unique"
ON "schedule_runs" USING btree ("production_shift_id")
WHERE "status" IN ('draft', 'accepted');
--> statement-breakpoint
ALTER TABLE "schedule_runs" ADD CONSTRAINT "schedule_runs_known_status"
CHECK ("schedule_runs"."status" IN ('draft', 'accepted', 'superseded', 'rejected'));
--> statement-breakpoint
ALTER TABLE "schedule_runs" ADD CONSTRAINT "schedule_runs_status_timestamps_valid"
CHECK (
  ("schedule_runs"."status" = 'accepted'
    AND "schedule_runs"."accepted_at" IS NOT NULL
    AND "schedule_runs"."accepted_by" IS NOT NULL
    AND "schedule_runs"."superseded_at" IS NULL)
  OR ("schedule_runs"."status" = 'draft'
    AND "schedule_runs"."accepted_at" IS NULL
    AND "schedule_runs"."accepted_by" IS NULL
    AND "schedule_runs"."superseded_at" IS NULL)
  OR "schedule_runs"."status" IN ('superseded', 'rejected')
);
--> statement-breakpoint
INSERT INTO "scheduler_configs" (
  "id", "location_id", "pulse_minutes", "fold_lbs_per_folder_minute",
  "algorithm_version", "version", "stage_fit_assertion", "asserted_by",
  "published_at"
)
SELECT
  gen_random_uuid(), latest."location_id", latest."pulse_minutes",
  latest."fold_lbs_per_folder_minute", 'fixed-pulse-ffd-v2',
  latest."max_version" + 1, latest."stage_fit_assertion",
  latest."asserted_by", now()
FROM (
  SELECT DISTINCT ON (config."location_id")
    config."location_id", config."pulse_minutes",
    config."fold_lbs_per_folder_minute", config."stage_fit_assertion",
    config."asserted_by",
    max(config."version") OVER (PARTITION BY config."location_id") AS max_version
  FROM "scheduler_configs" AS config
  ORDER BY config."location_id", config."version" DESC, config."published_at" DESC
) AS latest
WHERE NOT EXISTS (
  SELECT 1
  FROM "scheduler_configs" AS existing
  WHERE existing."location_id" = latest."location_id"
    AND existing."algorithm_version" = 'fixed-pulse-ffd-v2'
);
--> statement-breakpoint
ALTER TABLE "production_runs" ADD COLUMN "queue_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "production_runs" ADD COLUMN "planned_completion_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "production_runs" ADD COLUMN "overtime_proposal_hash" text;
--> statement-breakpoint
ALTER TABLE "production_runs" ADD COLUMN "overtime_queue_version" integer;
--> statement-breakpoint
ALTER TABLE "production_runs" ADD COLUMN "overtime_acknowledged_by" uuid;
--> statement-breakpoint
ALTER TABLE "production_runs" ADD COLUMN "overtime_acknowledged_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "production_runs" AS run
SET "planned_completion_at" = COALESCE(
  (
    SELECT max(batch."planned_done_at")
    FROM "production_batches" AS batch
    WHERE batch."production_run_id" = run."id"
  ),
  schedule."planned_completion_at"
)
FROM "schedule_runs" AS schedule
WHERE schedule."id" = run."schedule_run_id";
--> statement-breakpoint
ALTER TABLE "production_runs" ALTER COLUMN "planned_completion_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "production_runs" ALTER COLUMN "status" SET DEFAULT 'started';
--> statement-breakpoint
CREATE UNIQUE INDEX "production_runs_shift_unique"
ON "production_runs" USING btree ("production_shift_id");
--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_positive_queue_version"
CHECK ("production_runs"."queue_version" > 0);
--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_current_status_valid"
CHECK ("production_runs"."status" IN ('started', 'completed'));
--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_lifecycle_timestamps_valid"
CHECK (
  "production_runs"."started_at" IS NOT NULL
  AND (("production_runs"."status" = 'started' AND "production_runs"."completed_at" IS NULL)
    OR ("production_runs"."status" = 'completed' AND "production_runs"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_overtime_acknowledgement_paired"
CHECK (
  ("production_runs"."overtime_proposal_hash" IS NULL
    AND "production_runs"."overtime_queue_version" IS NULL
    AND "production_runs"."overtime_acknowledged_by" IS NULL
    AND "production_runs"."overtime_acknowledged_at" IS NULL)
  OR ("production_runs"."overtime_proposal_hash" IS NOT NULL
    AND "production_runs"."overtime_queue_version" IS NOT NULL
    AND "production_runs"."overtime_queue_version" > 0
    AND "production_runs"."overtime_acknowledged_by" IS NOT NULL
    AND "production_runs"."overtime_acknowledged_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "production_batches" ADD COLUMN "membership_frozen_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "production_batches" ADD COLUMN "membership_frozen_by" uuid;
--> statement-breakpoint
UPDATE "production_batches" AS batch
SET
  "membership_frozen_at" = COALESCE(
    batch."started_at",
    (
      SELECT min(stage."actual_start_at")
      FROM "stage_runs" AS stage
      WHERE stage."production_batch_id" = batch."id"
    ),
    batch."updated_at"
  ),
  "membership_frozen_by" = COALESCE(
    (
      SELECT COALESCE(stage."started_by", stage."completed_by")
      FROM "stage_runs" AS stage
      WHERE stage."production_batch_id" = batch."id"
        AND (stage."started_by" IS NOT NULL OR stage."completed_by" IS NOT NULL)
      ORDER BY stage."actual_start_at" NULLS LAST, stage."created_at", stage."id"
      LIMIT 1
    ),
    schedule."accepted_by",
    config."asserted_by"
  )
FROM "production_runs" AS run
JOIN "schedule_runs" AS schedule ON schedule."id" = run."schedule_run_id"
JOIN "scheduler_configs" AS config ON config."id" = schedule."scheduler_config_id"
WHERE batch."production_run_id" = run."id" AND batch."status" <> 'queued';
--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_membership_freeze_paired"
CHECK (("production_batches"."membership_frozen_at" IS NULL) = ("production_batches"."membership_frozen_by" IS NULL));
--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_nonqueued_membership_frozen"
CHECK (
  "production_batches"."status" = 'queued'
  OR ("production_batches"."membership_frozen_at" IS NOT NULL
    AND "production_batches"."membership_frozen_by" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD COLUMN "placement_provenance" text DEFAULT 'initial_schedule' NOT NULL;
--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD COLUMN "pinned_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD COLUMN "pinned_by" uuid;
--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD CONSTRAINT "production_batch_orders_known_placement_provenance"
CHECK ("production_batch_orders"."placement_provenance" IN ('initial_schedule', 'automatic', 'manager_exact'));
--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD CONSTRAINT "production_batch_orders_pin_valid"
CHECK (
  ("production_batch_orders"."placement_provenance" = 'manager_exact'
    AND "production_batch_orders"."pinned_at" IS NOT NULL
    AND "production_batch_orders"."pinned_by" IS NOT NULL)
  OR ("production_batch_orders"."placement_provenance" <> 'manager_exact'
    AND "production_batch_orders"."pinned_at" IS NULL
    AND "production_batch_orders"."pinned_by" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "pending_placement" jsonb;
