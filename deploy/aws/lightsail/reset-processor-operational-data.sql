\set ON_ERROR_STOP on

-- Production-only Processor operational reset.
--
-- This is an operator-run maintenance procedure, not a migration or an
-- application command. Stop API, Worker, and Processor; complete and verify an
-- encrypted backup; then invoke this file through the production restore
-- service with all four variables:
--
--   -v reset_id=processor-production-clean-slate-v1
--   -v release_sha=<deployed 40-character source SHA>
--   -v backup_sha256=<verified 64-character encrypted-backup SHA-256>
--
-- Configuration, Customer records, Access scope, source bindings, webhook
-- receipts, and quarantine evidence are preserved.

\if :{?reset_id}
\else
  DO $production_reset$
  BEGIN
    RAISE EXCEPTION 'reset_id is required.';
  END
  $production_reset$;
\endif

\if :{?release_sha}
\else
  DO $production_reset$
  BEGIN
    RAISE EXCEPTION 'release_sha is required.';
  END
  $production_reset$;
\endif

\if :{?backup_sha256}
\else
  DO $production_reset$
  BEGIN
    RAISE EXCEPTION 'backup_sha256 is required.';
  END
  $production_reset$;
\endif

SELECT
  current_setting('pressly.environment', true)
    = 'production_processor_reset'
  AND current_database() = 'pressly'
  AND current_user = 'pressly_migration'
  AND :'reset_id' = 'processor-production-clean-slate-v1'
  AND :'release_sha' ~ '^[a-f0-9]{40}$'
  AND :'backup_sha256' ~ '^[a-f0-9]{64}$'
    AS production_reset_confirmed
\gset

\if :production_reset_confirmed
\else
  DO $production_reset$
  BEGIN
    RAISE EXCEPTION
      'production Processor reset guard failed; use the exact reviewed invocation.';
  END
  $production_reset$;
\endif

SELECT
  to_regclass('public.order_source_proposal_transitions') IS NOT NULL
  AND to_regclass('public.order_source_terminal_tombstones') IS NOT NULL
    AS production_schema_confirmed
\gset

\if :production_schema_confirmed
\else
  DO $production_reset$
  BEGIN
    RAISE EXCEPTION
      'production Processor reset requires the current order-authority schema.';
  END
  $production_reset$;
\endif

SELECT EXISTS (
  SELECT 1
  FROM production_locations
  WHERE id = 'pressly-one'
    AND is_active = true
) AS production_location_confirmed
\gset

\if :production_location_confirmed
\else
  DO $production_reset$
  BEGIN
    RAISE EXCEPTION 'active production pressly-one location is required.';
  END
  $production_reset$;
\endif

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND usename = 'pressly_runtime'
    AND pid <> pg_backend_pid()
) AS runtime_quiesced
\gset

\if :runtime_quiesced
\else
  DO $production_reset$
  BEGIN
    RAISE EXCEPTION
      'production runtime sessions remain; stop API and Worker before reset.';
  END
  $production_reset$;
\endif

BEGIN;

SET LOCAL lock_timeout = '30s';
SET LOCAL statement_timeout = '5min';
SET LOCAL idle_in_transaction_session_timeout = '5min';

SELECT pg_advisory_xact_lock(
  hashtextextended('pressly:production-processor-clean-slate:v1', 0)
);

LOCK TABLE webhook_events IN SHARE MODE;

DO $production_reset$
DECLARE
  claimable_webhooks bigint;
BEGIN
  SELECT count(*)
  INTO claimable_webhooks
  FROM webhook_events
  WHERE status IN ('pending', 'processing');

  IF claimable_webhooks <> 0 THEN
    RAISE EXCEPTION
      'PRODUCTION_PROCESSOR_RESET_WEBHOOKS_CLAIMABLE count=%',
      claimable_webhooks;
  END IF;
END
$production_reset$;

CREATE TEMPORARY TABLE production_processor_reset_counts (
  relation_name text PRIMARY KEY,
  removed_rows bigint NOT NULL
) ON COMMIT PRESERVE ROWS;

INSERT INTO production_processor_reset_counts (relation_name, removed_rows)
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
  order_source_snapshots,
  order_source_customer_refs,
  order_source_links,
  order_items,
  order_fulfillments,
  orders
RESTART IDENTITY;

DO $production_reset$
DECLARE
  remaining_rows bigint;
BEGIN
  SELECT
    (SELECT count(*) FROM order_source_proposal_transitions)
    + (SELECT count(*) FROM order_source_terminal_tombstones)
    + (SELECT count(*) FROM order_source_proposal_resolutions)
    + (SELECT count(*) FROM order_source_proposals)
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
      'PRODUCTION_PROCESSOR_RESET_INCOMPLETE remaining=%',
      remaining_rows;
  END IF;
END
$production_reset$;

COMMIT;

\echo
\echo 'Production Processor operational reset completed.'

SELECT
  :'reset_id' AS reset_id,
  :'release_sha' AS release_sha,
  :'backup_sha256' AS backup_sha256;

SELECT relation_name, removed_rows
FROM production_processor_reset_counts
ORDER BY relation_name;

SELECT
  (SELECT count(*) FROM production_locations WHERE id = 'pressly-one')
    AS locations_preserved,
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
  ) AS processed_webhook_events_preserved,
  (
    SELECT count(*)
    FROM webhook_events
    WHERE status = 'dead'
  ) AS dead_webhook_events_preserved;
