\set ON_ERROR_STOP on

-- Disposable local-only administrative reset.
--
-- Required invocation:
--
--   docker exec \
--     -e PGOPTIONS=-cpressly.environment=local_processor_reset \
--     -i pressly-postgres-1 \
--     psql \
--       -U pressly \
--       -d pressly \
--       -P pager=off \
--       -v reset_id=processor-empty-slate-v1 \
--       -f - \
--     < reset-local-processor.sql
--
-- This is deliberately not a migration or application command.

\if :{?reset_id}
\else
  DO $local_reset$
  BEGIN
    RAISE EXCEPTION 'reset_id is required.';
  END
  $local_reset$;
\endif

SELECT
  current_setting('pressly.environment', true) = 'local_processor_reset'
  AND current_database() = 'pressly'
  AND :'reset_id' = 'processor-empty-slate-v1'
    AS local_reset_confirmed
\gset

\if :local_reset_confirmed
\else
  DO $local_reset$
  BEGIN
    RAISE EXCEPTION
      'local Processor reset guard failed; use the exact documented local invocation.';
  END
  $local_reset$;
\endif

SELECT EXISTS (
  SELECT 1
  FROM production_locations
  WHERE id = 'pressly-one'
    AND is_active = true
) AS local_location_confirmed
\gset

\if :local_location_confirmed
\else
  DO $local_reset$
  BEGIN
    RAISE EXCEPTION 'active local pressly-one location is required.';
  END
  $local_reset$;
\endif

BEGIN;

SET LOCAL lock_timeout = '30s';
SET LOCAL statement_timeout = '5min';

SELECT pg_advisory_xact_lock(
  hashtextextended('pressly:local-processor-empty-slate-reset:v1', 0)
);

CREATE TEMPORARY TABLE local_processor_reset_counts (
  relation_name text PRIMARY KEY,
  removed_rows bigint NOT NULL
) ON COMMIT PRESERVE ROWS;

INSERT INTO local_processor_reset_counts (relation_name, removed_rows)
VALUES
  ('orders', (SELECT count(*) FROM orders)),
  (
    'order_source_proposals',
    (SELECT count(*) FROM order_source_proposals)
  ),
  (
    'order_source_terminal_tombstones',
    (SELECT count(*) FROM order_source_terminal_tombstones)
  ),
  ('order_fulfillments', (SELECT count(*) FROM order_fulfillments)),
  ('order_demands', (SELECT count(*) FROM order_demands)),
  ('production_orders', (SELECT count(*) FROM production_orders)),
  ('production_bags', (SELECT count(*) FROM production_bags)),
  ('production_shifts', (SELECT count(*) FROM production_shifts)),
  ('schedule_runs', (SELECT count(*) FROM schedule_runs)),
  ('production_runs', (SELECT count(*) FROM production_runs)),
  ('production_batches', (SELECT count(*) FROM production_batches)),
  ('stage_runs', (SELECT count(*) FROM stage_runs)),
  (
    'order_and_run_work_events',
    (
      SELECT count(*)
      FROM work_events
      WHERE entity_type IN (
        'order_demand',
        'production_order',
        'production_order_bulk_resolution',
        'production_shift',
        'schedule_run',
        'production_run',
        'production_batch',
        'stage_run'
      )
    )
  );

DELETE FROM work_events
WHERE entity_type IN (
  'order_demand',
  'production_order',
  'production_order_bulk_resolution',
  'production_shift',
  'schedule_run',
  'production_run',
  'production_batch',
  'stage_run'
);

TRUNCATE TABLE
  order_source_proposal_transitions,
  order_source_terminal_tombstones,
  order_source_proposal_resolutions,
  order_source_proposals,
  order_source_observation_decisions,
  stage_machine_assignments,
  production_order_stage_attempts,
  production_batch_orders,
  stage_runs,
  production_batches,
  production_runs,
  schedule_runs,
  production_shift_selected_orders,
  production_shift_selections,
  production_bags,
  production_orders,
  order_demands,
  production_shifts,
  order_outbox_events,
  order_command_receipts,
  order_field_authorities,
  order_source_snapshots,
  order_source_customer_refs,
  order_source_links,
  order_items,
  order_fulfillments,
  orders
RESTART IDENTITY;

DO $local_reset$
DECLARE
  remaining_rows bigint;
BEGIN
  SELECT
    (SELECT count(*) FROM order_source_proposal_transitions)
    + (SELECT count(*) FROM order_source_terminal_tombstones)
    + (SELECT count(*) FROM order_source_proposal_resolutions)
    + (SELECT count(*) FROM order_source_proposals)
    + (SELECT count(*) FROM order_source_observation_decisions)
    + (SELECT count(*) FROM stage_machine_assignments)
    + (SELECT count(*) FROM production_order_stage_attempts)
    + (SELECT count(*) FROM production_batch_orders)
    + (SELECT count(*) FROM stage_runs)
    + (SELECT count(*) FROM production_batches)
    + (SELECT count(*) FROM production_runs)
    + (SELECT count(*) FROM schedule_runs)
    + (SELECT count(*) FROM production_shift_selected_orders)
    + (SELECT count(*) FROM production_shift_selections)
    + (SELECT count(*) FROM production_bags)
    + (SELECT count(*) FROM production_orders)
    + (SELECT count(*) FROM order_demands)
    + (SELECT count(*) FROM production_shifts)
    + (SELECT count(*) FROM order_outbox_events)
    + (SELECT count(*) FROM order_command_receipts)
    + (SELECT count(*) FROM order_field_authorities)
    + (SELECT count(*) FROM order_source_snapshots)
    + (SELECT count(*) FROM order_source_customer_refs)
    + (SELECT count(*) FROM order_source_links)
    + (SELECT count(*) FROM order_items)
    + (SELECT count(*) FROM order_fulfillments)
    + (SELECT count(*) FROM orders)
    + (
      SELECT count(*)
      FROM work_events
      WHERE entity_type IN (
        'order_demand',
        'production_order',
        'production_order_bulk_resolution',
        'production_shift',
        'schedule_run',
        'production_run',
        'production_batch',
        'stage_run'
      )
    )
  INTO remaining_rows;

  IF remaining_rows <> 0 THEN
    RAISE EXCEPTION
      'LOCAL_PROCESSOR_RESET_INCOMPLETE remaining %',
      remaining_rows;
  END IF;
END
$local_reset$;

COMMIT;

\echo
\echo 'Local Processor operational reset completed.'

SELECT relation_name, removed_rows
FROM local_processor_reset_counts
ORDER BY relation_name;

SELECT
  (SELECT count(*) FROM production_locations WHERE id = 'pressly-one') AS locations_preserved,
  (
    SELECT count(*)
    FROM production_stations
    WHERE location_id = 'pressly-one'
  ) AS stations_preserved,
  (
    SELECT count(*)
    FROM production_machines
    WHERE location_id = 'pressly-one'
  ) AS machines_preserved,
  (
    SELECT count(*)
    FROM scheduler_configs
    WHERE location_id = 'pressly-one'
  ) AS scheduler_configs_preserved,
  (
    SELECT count(*)
    FROM source_location_bindings
    WHERE location_id = 'pressly-one'
  ) AS source_bindings_preserved,
  (
    SELECT count(*)
    FROM webhook_events
    WHERE status = 'processed'
  ) AS processed_webhook_events_preserved;
