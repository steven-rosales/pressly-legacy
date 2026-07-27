-- Migration 0030 intentionally removed prelaunch Cents-owned order
-- aggregates. Orders that had already been scheduled could leave their
-- execution containers behind because batches, stages, and runs are not
-- children of an order.
--
-- An execution container is safe to retire only when it has no visible
-- membership and no order-stage attempt. Those two negative proofs preserve
-- physical production history: this migration does not guess through a batch
-- that still has an order route.
DO $migration$
DECLARE
  repaired_at constant timestamptz := clock_timestamp();
  retired_run_count bigint;
  retired_batch_count bigint;
BEGIN
  PERFORM set_config('lock_timeout', '30s', true);

  LOCK TABLE
    production_shifts,
    production_shift_selected_orders,
    schedule_runs,
    production_runs,
    production_batches,
    production_batch_orders,
    stage_runs,
    stage_machine_assignments,
    production_order_stage_attempts,
    production_orders,
    work_events
  IN SHARE ROW EXCLUSIVE MODE;

  CREATE TEMP TABLE pressly_0031_empty_batches
  ON COMMIT DROP
  AS
  SELECT
    batch.id,
    batch.location_id,
    batch.production_run_id
  FROM production_batches AS batch
  WHERE NOT EXISTS (
      SELECT 1
      FROM production_batch_orders AS membership
      WHERE membership.production_batch_id = batch.id
        AND (
          membership.active = true
          OR batch.status = 'finished'
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM production_order_stage_attempts AS attempt
      JOIN stage_runs AS stage
        ON stage.id = attempt.stage_run_id
       AND stage.location_id = attempt.location_id
      WHERE stage.production_batch_id = batch.id
    );

  CREATE TEMP TABLE pressly_0031_empty_runs
  ON COMMIT DROP
  AS
  SELECT
    run.id,
    run.location_id,
    run.production_shift_id,
    run.schedule_run_id
  FROM production_runs AS run
  WHERE NOT EXISTS (
      SELECT 1
      FROM production_batches AS batch
      JOIN production_batch_orders AS membership
        ON membership.production_batch_id = batch.id
       AND (
         membership.active = true
         OR batch.status = 'finished'
       )
      WHERE batch.production_run_id = run.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM production_order_stage_attempts AS attempt
      WHERE attempt.production_run_id = run.id
    );

  CREATE TEMP TABLE pressly_0031_retired_batches
  ON COMMIT DROP
  AS
  SELECT empty_batch.id, empty_batch.location_id
  FROM pressly_0031_empty_batches AS empty_batch;

  CREATE TEMP TABLE pressly_0031_retired_stages
  ON COMMIT DROP
  AS
  SELECT stage.id, stage.location_id
  FROM stage_runs AS stage
  JOIN pressly_0031_retired_batches AS retired_batch
    ON retired_batch.id = stage.production_batch_id;

  SELECT count(*)
  INTO retired_run_count
  FROM pressly_0031_empty_runs;

  SELECT count(*)
  INTO retired_batch_count
  FROM pressly_0031_empty_batches;

  -- The accepted plan remains useful audit evidence, but must never become
  -- actionable again after its committed execution graph is retired.
  UPDATE schedule_runs AS schedule
  SET
    status = 'superseded',
    superseded_at = repaired_at
  FROM pressly_0031_empty_runs AS empty_run
  WHERE schedule.id = empty_run.schedule_run_id
    AND schedule.status IN ('draft', 'accepted');

  -- A shift with surviving explicit selections stays open so it can be
  -- replanned. A shift made completely empty by cleanup is terminal.
  UPDATE production_shifts AS shift
  SET
    status = 'closed',
    version = shift.version + 1,
    updated_at = repaired_at
  FROM pressly_0031_empty_runs AS empty_run
  WHERE shift.id = empty_run.production_shift_id
    AND shift.status <> 'closed'
    AND NOT EXISTS (
      SELECT 1
      FROM production_shift_selected_orders AS selected_order
      WHERE selected_order.production_shift_id = shift.id
    );

  -- Work events deliberately have no foreign keys. Remove only events whose
  -- execution entity is retired so the audit stream does not point at a
  -- container that no longer exists.
  DELETE FROM work_events AS event
  USING pressly_0031_retired_stages AS retired_stage
  WHERE event.entity_type = 'stage_run'
    AND event.entity_id = retired_stage.id;

  DELETE FROM work_events AS event
  USING pressly_0031_retired_batches AS retired_batch
  WHERE event.entity_type = 'production_batch'
    AND event.entity_id = retired_batch.id;

  DELETE FROM work_events AS event
  USING pressly_0031_empty_runs AS empty_run
  WHERE event.entity_type = 'production_run'
    AND event.entity_id = empty_run.id;

  -- Deleting a run cascades through its batches, stages, assignments, and
  -- memberships. The negative proofs above guarantee there are no order-stage
  -- attempts to erase.
  DELETE FROM production_runs AS run
  USING pressly_0031_empty_runs AS empty_run
  WHERE run.id = empty_run.id;

  -- A partially affected run may retain valid batches. Remove only its
  -- provably empty containers.
  DELETE FROM production_batches AS batch
  USING pressly_0031_empty_batches AS empty_batch
  WHERE batch.id = empty_batch.id;

  CREATE TEMP TABLE pressly_0031_impacted_runs
  ON COMMIT DROP
  AS
  SELECT DISTINCT empty_batch.production_run_id AS id
  FROM pressly_0031_empty_batches AS empty_batch
  WHERE NOT EXISTS (
    SELECT 1
    FROM pressly_0031_empty_runs AS empty_run
    WHERE empty_run.id = empty_batch.production_run_id
  );

  CREATE TEMP TABLE pressly_0031_batch_sequence
  ON COMMIT DROP
  AS
  SELECT
    batch.id,
    (
      row_number() OVER (
        PARTITION BY batch.production_run_id
        ORDER BY batch.sequence_index, batch.id
      ) - 1
    )::integer AS sequence_index,
    row_number() OVER (
      PARTITION BY batch.production_run_id
      ORDER BY batch.sequence_index, batch.id
    )::integer AS temporary_index
  FROM production_batches AS batch
  JOIN pressly_0031_impacted_runs AS impacted_run
    ON impacted_run.id = batch.production_run_id;

  -- Move through unique negative indexes before compacting to zero-based
  -- indexes; this avoids transient collisions in the per-run unique index.
  UPDATE production_batches AS batch
  SET sequence_index = -sequence.temporary_index
  FROM pressly_0031_batch_sequence AS sequence
  WHERE batch.id = sequence.id;

  UPDATE production_batches AS batch
  SET
    sequence_index = sequence.sequence_index,
    derived_weight_lbs = visible_weight.derived_weight_lbs,
    version = batch.version + 1,
    updated_at = repaired_at
  FROM
    pressly_0031_batch_sequence AS sequence,
    (
      SELECT
        candidate.id,
        sum(production_order.derived_weight_lbs) AS derived_weight_lbs
      FROM production_batch_orders AS membership
      JOIN production_batches AS candidate
        ON candidate.id = membership.production_batch_id
      JOIN production_orders AS production_order
        ON production_order.id = membership.production_order_id
       AND production_order.location_id = membership.location_id
      WHERE (
          membership.active = true
          OR candidate.status = 'finished'
        )
      GROUP BY candidate.id
    ) AS visible_weight
  WHERE batch.id = sequence.id
    AND visible_weight.id = batch.id
    AND visible_weight.derived_weight_lbs IS NOT NULL;

  UPDATE production_runs AS run
  SET
    planned_completion_at = remaining.planned_completion_at,
    queue_version = run.queue_version + 1,
    version = run.version + 1,
    overtime_proposal_hash = NULL,
    overtime_queue_version = NULL,
    overtime_acknowledged_by = NULL,
    overtime_acknowledged_at = NULL,
    updated_at = repaired_at
  FROM (
    SELECT
      batch.production_run_id,
      max(batch.planned_done_at) AS planned_completion_at
    FROM production_batches AS batch
    JOIN pressly_0031_impacted_runs AS impacted_run
      ON impacted_run.id = batch.production_run_id
    GROUP BY batch.production_run_id
  ) AS remaining
  WHERE run.id = remaining.production_run_id;

  RAISE NOTICE
    'Production execution repair retired % run(s) and % empty batch container(s).',
    retired_run_count,
    retired_batch_count;
END
$migration$;
