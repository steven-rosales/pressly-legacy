-- One-time prelaunch cleanup requested for the production rollout on 2026-07-23.
--
-- Scope is deliberately source-owned and fixed:
--   * only canonical orders linked exclusively to Cents
--   * the first Cents link was created before midnight in America/New_York
--   * canonical users and webhook receipt/quarantine audit records are preserved
--
-- A later Cents observation may recreate an order through the normal ingestion path.
DO $migration$
DECLARE
  cutoff_at constant timestamptz :=
    '2026-07-23 00:00:00 America/New_York'::timestamptz;
  target_count bigint;
  deleted_count bigint;
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
    production_batch_orders,
    production_order_stage_attempts,
    work_events
  IN SHARE ROW EXCLUSIVE MODE;

  CREATE TEMP TABLE pressly_0030_target_orders
  ON COMMIT DROP
  AS
  SELECT DISTINCT cents_link.order_id
  FROM order_source_links AS cents_link
  WHERE cents_link.source = 'cents'
    AND cents_link.created_at < cutoff_at
    AND NOT EXISTS (
      SELECT 1
      FROM order_source_links AS other_link
      WHERE other_link.order_id = cents_link.order_id
        AND other_link.source <> 'cents'
    );

  CREATE TEMP TABLE pressly_0030_target_fulfillments
  ON COMMIT DROP
  AS
  SELECT fulfillment.id
  FROM order_fulfillments AS fulfillment
  JOIN pressly_0030_target_orders AS target
    ON target.order_id = fulfillment.order_id;

  CREATE TEMP TABLE pressly_0030_target_demands
  ON COMMIT DROP
  AS
  SELECT demand.id
  FROM order_demands AS demand
  JOIN pressly_0030_target_fulfillments AS target
    ON target.id = demand.fulfillment_id;

  CREATE TEMP TABLE pressly_0030_target_production_orders
  ON COMMIT DROP
  AS
  SELECT production_order.id
  FROM production_orders AS production_order
  JOIN pressly_0030_target_demands AS target
    ON target.id = production_order.order_demand_id;

  SELECT count(*)
  INTO target_count
  FROM pressly_0030_target_orders;

  DELETE FROM work_events AS event
  USING pressly_0030_target_production_orders AS production_target
  WHERE event.entity_type = 'production_order'
    AND event.entity_id = production_target.id;

  DELETE FROM work_events AS event
  USING pressly_0030_target_demands AS demand_target
  WHERE event.entity_type = 'order_demand'
    AND event.entity_id = demand_target.id;

  DELETE FROM production_order_stage_attempts AS attempt
  USING pressly_0030_target_production_orders AS target
  WHERE attempt.production_order_id = target.id;

  DELETE FROM production_shift_selected_orders AS selected_order
  USING pressly_0030_target_production_orders AS target
  WHERE selected_order.production_order_id = target.id;

  DELETE FROM production_batch_orders AS batch_order
  USING pressly_0030_target_production_orders AS target
  WHERE batch_order.production_order_id = target.id;

  DELETE FROM production_bags AS bag
  USING pressly_0030_target_production_orders AS target
  WHERE bag.production_order_id = target.id;

  DELETE FROM production_orders AS production_order
  USING pressly_0030_target_production_orders AS target
  WHERE production_order.id = target.id;

  DELETE FROM order_demands AS demand
  USING pressly_0030_target_demands AS target
  WHERE demand.id = target.id;

  DELETE FROM order_outbox_events AS event
  USING pressly_0030_target_orders AS target
  WHERE event.order_id = target.order_id;

  DELETE FROM order_command_receipts AS receipt
  USING pressly_0030_target_orders AS target
  WHERE receipt.order_id = target.order_id;

  DELETE FROM order_source_links AS source_link
  USING pressly_0030_target_orders AS target
  WHERE source_link.order_id = target.order_id;

  DELETE FROM order_fulfillments AS fulfillment
  USING pressly_0030_target_fulfillments AS target
  WHERE fulfillment.id = target.id;

  DELETE FROM orders AS canonical_order
  USING pressly_0030_target_orders AS target
  WHERE canonical_order.id = target.order_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count <> target_count THEN
    RAISE EXCEPTION
      'PRELAUNCH_CENTS_ORDER_CLEANUP_COUNT_MISMATCH expected %, deleted %',
      target_count,
      deleted_count;
  END IF;

  RAISE NOTICE
    'Prelaunch Cents order cleanup removed % canonical order(s) created before %.',
    deleted_count,
    cutoff_at;
END
$migration$;
