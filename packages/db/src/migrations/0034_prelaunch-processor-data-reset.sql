-- One-time prelaunch reset explicitly requested for the production rollout on
-- 2026-07-27.
--
-- This clears the test-only canonical Order aggregates and Production
-- execution history that feed the Processor so the first real rollout starts
-- from an empty operational surface. It deliberately preserves Users, webhook
-- receipts, pricing, production locations, stations, machines, and scheduler
-- configuration.
--
-- This is not the routine archive policy and is not exposed as an application
-- command. The migration journal runs it once. Later source observations create
-- new Orders through the normal ingestion path. production_locations.live_revision
-- remains monotonic and is intentionally not reset.
DO $migration$
DECLARE
  canonical_order_count bigint;
  production_order_count bigint;
  production_run_count bigint;
  schedule_run_count bigint;
  production_shift_count bigint;
  runtime_event_count bigint;
  remaining_count bigint;
BEGIN
  PERFORM set_config('lock_timeout', '30s', true);

  LOCK TABLE
    orders,
    order_source_links,
    order_source_snapshots,
    order_source_customer_refs,
    order_items,
    order_field_authorities,
    order_command_receipts,
    order_fulfillments,
    order_outbox_events,
    order_demands,
    production_orders,
    production_bags,
    production_shift_selected_orders,
    production_shift_selections,
    production_order_stage_attempts,
    production_batch_orders,
    stage_machine_assignments,
    stage_runs,
    production_batches,
    production_runs,
    schedule_runs,
    production_shifts,
    work_events
  IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO canonical_order_count FROM orders;
  SELECT count(*) INTO production_order_count FROM production_orders;
  SELECT count(*) INTO production_run_count FROM production_runs;
  SELECT count(*) INTO schedule_run_count FROM schedule_runs;
  SELECT count(*) INTO production_shift_count FROM production_shifts;
  SELECT count(*)
  INTO runtime_event_count
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

  DELETE FROM stage_machine_assignments;
  DELETE FROM production_order_stage_attempts;
  DELETE FROM production_batch_orders;
  DELETE FROM stage_runs;
  DELETE FROM production_batches;
  DELETE FROM production_runs;
  DELETE FROM schedule_runs;
  DELETE FROM production_shift_selected_orders;
  DELETE FROM production_shift_selections;
  DELETE FROM production_bags;
  DELETE FROM production_orders;
  DELETE FROM order_demands;
  DELETE FROM production_shifts;

  DELETE FROM order_outbox_events;
  DELETE FROM order_command_receipts;
  DELETE FROM order_source_links;
  DELETE FROM order_fulfillments;
  DELETE FROM orders;

  SELECT
    (SELECT count(*) FROM orders)
    + (SELECT count(*) FROM order_source_links)
    + (SELECT count(*) FROM order_source_snapshots)
    + (SELECT count(*) FROM order_source_customer_refs)
    + (SELECT count(*) FROM order_items)
    + (SELECT count(*) FROM order_field_authorities)
    + (SELECT count(*) FROM order_command_receipts)
    + (SELECT count(*) FROM order_fulfillments)
    + (SELECT count(*) FROM order_outbox_events)
    + (SELECT count(*) FROM order_demands)
    + (SELECT count(*) FROM production_orders)
    + (SELECT count(*) FROM production_bags)
    + (SELECT count(*) FROM production_shift_selected_orders)
    + (SELECT count(*) FROM production_shift_selections)
    + (SELECT count(*) FROM production_order_stage_attempts)
    + (SELECT count(*) FROM production_batch_orders)
    + (SELECT count(*) FROM stage_machine_assignments)
    + (SELECT count(*) FROM stage_runs)
    + (SELECT count(*) FROM production_batches)
    + (SELECT count(*) FROM production_runs)
    + (SELECT count(*) FROM schedule_runs)
    + (SELECT count(*) FROM production_shifts)
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
  INTO remaining_count;

  IF remaining_count <> 0 THEN
    RAISE EXCEPTION
      'PRELAUNCH_PROCESSOR_DATA_RESET_INCOMPLETE remaining %',
      remaining_count;
  END IF;

  RAISE NOTICE
    'Prelaunch Processor reset removed % canonical order(s), % Production order(s), % Production run(s), % schedule run(s), % shift(s), and % runtime event(s).',
    canonical_order_count,
    production_order_count,
    production_run_count,
    schedule_run_count,
    production_shift_count,
    runtime_event_count;
END
$migration$;
