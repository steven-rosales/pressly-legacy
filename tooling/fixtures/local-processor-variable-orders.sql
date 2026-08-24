\set ON_ERROR_STOP on

-- Local-only Processor fixture.
--
-- Run from the repository root:
--
--   docker exec \
--     -e PGOPTIONS=-cpressly.environment=local_fixture \
--     -i pressly-postgres-1 \
--     psql \
--       -U pressly \
--       -d pressly \
--       -P pager=off \
--       -v fixture_id=processor-variable-orders-v1 \
--       -f - \
--     < tooling/fixtures/local-processor-variable-orders.sql
--
-- The custom session setting, exact fixture ID, local container name, and
-- location assertion intentionally keep this fixture outside deployment and
-- migration paths. It owns only source identities beginning with
-- LOCAL-PROCESSOR-V1 and LOCAL-CUSTOMER-V1.
-- Source links and snapshots represent already-accepted historical provenance;
-- this fixture intentionally creates no source authority, posture, profile, or
-- observation-decision state.

\if :{?fixture_id}
\else
  DO $local_fixture$
  BEGIN
    RAISE EXCEPTION 'fixture_id is required.';
  END
  $local_fixture$;
\endif

SELECT
  current_setting('pressly.environment', true) = 'local_fixture'
  AND :'fixture_id' = 'processor-variable-orders-v1'
    AS local_fixture_confirmed
\gset

\if :local_fixture_confirmed
\else
  DO $local_fixture$
  BEGIN
    RAISE EXCEPTION
      'local fixture guard failed; use the documented local Docker command.';
  END
  $local_fixture$;
\endif

SELECT EXISTS (
  SELECT 1
  FROM production_locations
  WHERE id = 'pressly-one'
    AND is_active = true
) AS fixture_location_exists
\gset

\if :fixture_location_exists
\else
  DO $local_fixture$
  BEGIN
    RAISE EXCEPTION
      'the local pressly-one production location is not active.';
  END
  $local_fixture$;
\endif

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '2min';

SELECT pg_advisory_xact_lock(
  hashtextextended('pressly:local-fixture:processor-variable-orders-v1', 0)
);

CREATE TEMPORARY TABLE fixture_existing_orders ON COMMIT DROP AS
SELECT order_id
FROM order_source_links
WHERE source = 'cents'
  AND external_order_id LIKE 'LOCAL-PROCESSOR-V1-%';

SELECT NOT EXISTS (
  SELECT 1
  FROM fixture_existing_orders AS fixture_order
  INNER JOIN order_fulfillments AS fulfillment
    ON fulfillment.order_id = fixture_order.order_id
  INNER JOIN order_demands AS demand
    ON demand.fulfillment_id = fulfillment.id
  INNER JOIN production_orders AS production_order
    ON production_order.order_demand_id = demand.id
  WHERE EXISTS (
    SELECT 1
    FROM production_shift_selected_orders AS selected_order
    WHERE selected_order.production_order_id = production_order.id
  )
  OR EXISTS (
    SELECT 1
    FROM production_batch_orders AS batch_order
    WHERE batch_order.production_order_id = production_order.id
  )
) AS fixture_refresh_safe
\gset

\if :fixture_refresh_safe
\else
  DO $local_fixture$
  BEGIN
    RAISE EXCEPTION
      'fixture orders are selected or have production history; clear the local plan before refreshing this fixture.';
  END
  $local_fixture$;
\endif

CREATE TEMPORARY TABLE fixture_existing_users ON COMMIT DROP AS
SELECT user_id
FROM user_source_links
WHERE source = 'cents'
  AND external_user_id LIKE 'LOCAL-CUSTOMER-V1-%';

DELETE FROM order_outbox_events AS outbox
USING fixture_existing_orders AS fixture_order
WHERE outbox.order_id = fixture_order.order_id;

DELETE FROM production_bags AS bag
USING
  production_orders AS production_order,
  order_demands AS demand,
  order_fulfillments AS fulfillment,
  fixture_existing_orders AS fixture_order
WHERE bag.production_order_id = production_order.id
  AND production_order.order_demand_id = demand.id
  AND demand.fulfillment_id = fulfillment.id
  AND fulfillment.order_id = fixture_order.order_id;

DELETE FROM production_orders AS production_order
USING
  order_demands AS demand,
  order_fulfillments AS fulfillment,
  fixture_existing_orders AS fixture_order
WHERE production_order.order_demand_id = demand.id
  AND demand.fulfillment_id = fulfillment.id
  AND fulfillment.order_id = fixture_order.order_id;

DELETE FROM order_demands AS demand
USING
  order_fulfillments AS fulfillment,
  fixture_existing_orders AS fixture_order
WHERE demand.fulfillment_id = fulfillment.id
  AND fulfillment.order_id = fixture_order.order_id;

DELETE FROM order_source_links
WHERE source = 'cents'
  AND external_order_id LIKE 'LOCAL-PROCESSOR-V1-%';

DELETE FROM orders AS canonical_order
USING fixture_existing_orders AS fixture_order
WHERE canonical_order.id = fixture_order.order_id;

DELETE FROM user_source_links
WHERE source = 'cents'
  AND external_user_id LIKE 'LOCAL-CUSTOMER-V1-%';

DELETE FROM users AS canonical_user
USING fixture_existing_users AS fixture_user
WHERE canonical_user.id = fixture_user.user_id;

CREATE TEMPORARY TABLE fixture_user_specs (
  ordinal integer PRIMARY KEY,
  first_name text,
  last_name text,
  business_name text,
  phone text,
  email text
) ON COMMIT DROP;

INSERT INTO fixture_user_specs (
  ordinal,
  first_name,
  last_name,
  business_name,
  phone,
  email
)
VALUES
  (1, 'Mia', 'Torres', NULL, '+12015550101', 'mia.torres@example.test'),
  (2, 'Leo', 'Brooks', NULL, '+12015550102', 'leo.brooks@example.test'),
  (3, 'Ava', 'Patel', NULL, '+12015550103', 'ava.patel@example.test'),
  (4, 'Noah', 'Chen', NULL, '+12015550104', 'noah.chen@example.test'),
  (5, 'Sofia', 'Rivera', NULL, '+12015550105', 'sofia.rivera@example.test'),
  (6, 'Mateo', 'Johnson', NULL, '+12015550106', 'mateo.johnson@example.test'),
  (7, NULL, NULL, 'Bright Hotel', '+12015550107', 'laundry@bright-hotel.example.test'),
  (8, 'Camila', 'Reed', NULL, '+12015550108', 'camila.reed@example.test');

CREATE TEMPORARY TABLE fixture_users ON COMMIT DROP AS
SELECT
  user_spec.*,
  '00000000-0000-4000-8000-000000000100'::uuid AS business_id,
  (
    'b1000000-0000-4000-8000-'
    || lpad(user_spec.ordinal::text, 12, '0')
  )::uuid AS user_id,
  (
    'b2000000-0000-4000-8000-'
    || lpad(user_spec.ordinal::text, 12, '0')
  )::uuid AS source_link_id,
  'LOCAL-CUSTOMER-V1-'
    || lpad(user_spec.ordinal::text, 3, '0') AS external_user_id
FROM fixture_user_specs AS user_spec;

INSERT INTO users (
  id,
  business_id,
  version,
  first_name,
  last_name,
  business_name,
  phone,
  email,
  active,
  created_at,
  updated_at
)
SELECT
  user_id,
  business_id,
  1,
  first_name,
  last_name,
  business_name,
  phone,
  email,
  true,
  now(),
  now()
FROM fixture_users;

INSERT INTO user_source_links (
  id,
  source,
  external_user_id,
  user_id,
  created_at,
  updated_at
)
SELECT
  source_link_id,
  'cents',
  external_user_id,
  user_id,
  now(),
  now()
FROM fixture_users;

INSERT INTO user_source_snapshots (
  source_link_id,
  source_revision_at,
  source_revision_hash,
  adapter_version,
  normalized_payload_json,
  observed_at,
  created_at,
  updated_at
)
SELECT
  source_link_id,
  now() - make_interval(mins => ordinal),
  md5('local-user-' || ordinal::text)
    || md5('local-user-revision-' || ordinal::text),
  'local-processor-fixture-v1',
  jsonb_build_object(
    'externalUserId', external_user_id,
    'firstName', first_name,
    'lastName', last_name,
    'businessName', business_name,
    'phone', phone,
    'email', email
  ),
  now(),
  now(),
  now()
FROM fixture_users;

CREATE TEMPORARY TABLE fixture_order_specs (
  ordinal integer PRIMARY KEY,
  order_code text NOT NULL,
  customer_ordinal integer,
  customer_resolution text NOT NULL,
  source_status text NOT NULL,
  order_state text NOT NULL,
  release_state text NOT NULL,
  admission_state text NOT NULL,
  commercial_state text NOT NULL,
  demand_phase text NOT NULL,
  weight_lbs numeric(12, 3),
  due_day_offset integer NOT NULL,
  due_hour integer NOT NULL,
  production_status text,
  bag_count integer,
  priority boolean NOT NULL,
  admission_override boolean NOT NULL,
  scenario text NOT NULL
) ON COMMIT DROP;

INSERT INTO fixture_order_specs (
  ordinal,
  order_code,
  customer_ordinal,
  customer_resolution,
  source_status,
  order_state,
  release_state,
  admission_state,
  commercial_state,
  demand_phase,
  weight_lbs,
  due_day_offset,
  due_hour,
  production_status,
  bag_count,
  priority,
  admission_override,
  scenario
)
VALUES
  (1, 'TEST-FCST-001', 1, 'resolved', 'SUBMITTED', 'open', 'unreleased', 'unreleased', 'open', 'expected', 24.000, -1, 17, 'release_pending', NULL, false, false, 'forecast overdue'),
  (2, 'TEST-FCST-002', 2, 'resolved', 'READY_FOR_PICKUP', 'open', 'unreleased', 'unreleased', 'open', 'expected', 39.500, 0, 20, 'release_pending', NULL, false, false, 'forecast due today'),
  (3, 'TEST-FCST-003', 3, 'resolved', 'PICKED_UP', 'open', 'unreleased', 'unreleased', 'open', 'inbound', 64.000, 1, 17, 'release_pending', NULL, true, false, 'forecast inbound'),
  (4, 'TEST-FCST-004', 1, 'resolved', 'PICKED_UP', 'open', 'unreleased', 'unreleased', 'open', 'inbound', 81.000, 0, 18, 'release_pending', 3, false, false, 'forecast with early physical intake'),
  (5, 'TEST-FCST-005', NULL, 'not_provided', 'SUBMITTED', 'open', 'unreleased', 'unreleased', 'open', 'expected', NULL, 0, 21, NULL, NULL, false, false, 'forecast missing estimate'),
  (6, 'TEST-INTAKE-001', 5, 'resolved', 'IN_PROGRESS', 'open', 'released', 'released', 'open', 'production_released', 18.000, -2, 17, 'intake_pending', NULL, true, false, 'released and overdue'),
  (7, 'TEST-INTAKE-002', 6, 'resolved', 'IN_PROGRESS', 'open', 'released', 'released', 'open', 'production_released', 34.500, 0, 17, 'intake_pending', NULL, false, false, 'released due today'),
  (8, 'TEST-INTAKE-003', 7, 'resolved', 'IN_PROGRESS', 'open', 'released', 'released', 'open', 'production_released', 56.000, 1, 16, 'intake_pending', NULL, false, false, 'commercial intake tomorrow'),
  (9, 'TEST-INTAKE-004', NULL, 'pending', 'IN_PROGRESS', 'open', 'released', 'released', 'open', 'production_released', 93.000, 2, 17, 'intake_pending', NULL, false, false, 'unresolved customer'),
  (10, 'TEST-READY-001', 8, 'resolved', 'IN_PROGRESS', 'open', 'released', 'released', 'open', 'production_released', 22.000, -1, 17, 'eligible', 1, true, false, 'ready and overdue'),
  (11, 'TEST-READY-002', 2, 'resolved', 'IN_PROGRESS', 'open', 'released', 'released', 'open', 'production_released', 48.000, 0, 17, 'eligible', 2, false, false, 'ready due today'),
  (12, 'TEST-READY-003', 3, 'resolved', 'IN_PROGRESS', 'open', 'released', 'released', 'open', 'production_released', 73.000, 0, 19, 'eligible', 3, true, false, 'ready priority'),
  (13, 'TEST-READY-004', 4, 'resolved', 'IN_PROGRESS', 'open', 'released', 'released', 'open', 'production_released', 116.000, 1, 18, 'eligible', 4, false, false, 'large ready order'),
  (14, 'TEST-READY-005', 5, 'resolved', 'IN_PROGRESS', 'open', 'released', 'released', 'open', 'production_released', 31.000, 2, 17, 'eligible', 2, false, false, 'later ready order'),
  (15, 'TEST-MANUAL-001', 6, 'resolved', 'PICKED_UP', 'open', 'unreleased', 'unreleased', 'open', 'inbound', 44.000, 0, 18, 'eligible', 2, true, true, 'manual production release'),
  (16, 'TEST-REVIEW-001', 7, 'resolved', 'COMPLETED', 'completed', 'released', 'released', 'completed', 'post_production', 52.000, 0, 17, 'eligible', 2, false, false, 'source complete but floor unfinished'),
  (17, 'TEST-REVIEW-002', 8, 'resolved', 'CANCELED', 'canceled', 'withdrawn', 'withdrawn', 'canceled', 'withdrawn', 27.000, 1, 17, 'eligible', 1, false, false, 'source canceled after physical intake'),
  (18, 'TEST-FINISHED-001', 1, 'resolved', 'IN_PROGRESS', 'open', 'released', 'released', 'open', 'production_released', 36.000, -3, 17, 'finished', 2, false, false, 'floor finished while source remains open');

CREATE TEMPORARY TABLE fixture_orders ON COMMIT DROP AS
SELECT
  order_spec.*,
  '00000000-0000-4000-8000-000000000100'::uuid AS business_id,
  (
    'a1000000-0000-4000-8000-'
    || lpad(order_spec.ordinal::text, 12, '0')
  )::uuid AS order_id,
  (
    'a2000000-0000-4000-8000-'
    || lpad(order_spec.ordinal::text, 12, '0')
  )::uuid AS fulfillment_id,
  (
    'a3000000-0000-4000-8000-'
    || lpad(order_spec.ordinal::text, 12, '0')
  )::uuid AS demand_id,
  (
    'a4000000-0000-4000-8000-'
    || lpad(order_spec.ordinal::text, 12, '0')
  )::uuid AS production_order_id,
  (
    'a5000000-0000-4000-8000-'
    || lpad(order_spec.ordinal::text, 12, '0')
  )::uuid AS source_link_id,
  (
    'a6000000-0000-4000-8000-'
    || lpad(order_spec.ordinal::text, 12, '0')
  )::uuid AS order_item_id,
  (
    'a7000000-0000-4000-8000-'
    || lpad(order_spec.ordinal::text, 12, '0')
  )::uuid AS outbox_event_id,
  'LOCAL-PROCESSOR-V1-'
    || lpad(order_spec.ordinal::text, 3, '0') AS external_order_id,
  (
    date_trunc('day', now() AT TIME ZONE 'America/New_York')
    + make_interval(
      days => order_spec.due_day_offset,
      hours => order_spec.due_hour
    )
  ) AT TIME ZONE 'America/New_York' AS due_at,
  COALESCE(round(order_spec.weight_lbs * 167)::integer, 0)
    AS total_amount_cents,
  md5('local-order-projection-' || order_spec.ordinal::text)
    || md5('local-order-projection-v1-' || order_spec.ordinal::text)
    AS projection_hash,
  md5('local-order-revision-' || order_spec.ordinal::text)
    || md5('local-order-revision-v1-' || order_spec.ordinal::text)
    AS revision_hash
FROM fixture_order_specs AS order_spec;

INSERT INTO orders (
  id,
  business_id,
  customer_id,
  customer_version,
  customer_first_name,
  customer_last_name,
  customer_business_name,
  customer_phone,
  customer_email,
  customer_resolution,
  display_number,
  state,
  due_at,
  currency,
  total_amount_cents,
  balance_due_cents,
  version,
  created_at,
  updated_at
)
SELECT
  fixture_order.order_id,
  fixture_order.business_id,
  CASE
    WHEN fixture_order.customer_resolution = 'resolved'
      THEN fixture_user.user_id
    ELSE NULL
  END,
  CASE
    WHEN fixture_order.customer_resolution = 'resolved' THEN 1
    ELSE NULL
  END,
  CASE
    WHEN fixture_order.customer_resolution = 'resolved'
      THEN fixture_user.first_name
    ELSE NULL
  END,
  CASE
    WHEN fixture_order.customer_resolution = 'resolved'
      THEN fixture_user.last_name
    ELSE NULL
  END,
  CASE
    WHEN fixture_order.customer_resolution = 'resolved'
      THEN fixture_user.business_name
    ELSE NULL
  END,
  CASE
    WHEN fixture_order.customer_resolution = 'resolved'
      THEN fixture_user.phone
    ELSE NULL
  END,
  CASE
    WHEN fixture_order.customer_resolution = 'resolved'
      THEN fixture_user.email
    ELSE NULL
  END,
  fixture_order.customer_resolution,
  fixture_order.order_code,
  fixture_order.order_state,
  fixture_order.due_at,
  'USD',
  fixture_order.total_amount_cents,
  0,
  1,
  now(),
  now()
FROM fixture_orders AS fixture_order
LEFT JOIN fixture_users AS fixture_user
  ON fixture_user.ordinal = fixture_order.customer_ordinal;

INSERT INTO order_items (
  id,
  business_id,
  order_id,
  line_key,
  item_type,
  code,
  description,
  quantity,
  unit,
  unit_price_cents,
  total_amount_cents,
  source_metadata_json,
  created_at,
  updated_at
)
SELECT
  order_item_id,
  business_id,
  order_id,
  'wash-fold',
  'service',
  'LAUNDRY',
  'Wash & Fold',
  CASE WHEN weight_lbs IS NULL THEN 0 ELSE 1 END,
  'service_unit',
  167,
  total_amount_cents,
  jsonb_build_object(
    'fixture', :'fixture_id',
    'scenario', scenario,
    'unitPriceCents', 167
  ),
  now(),
  now()
FROM fixture_orders;

INSERT INTO order_fulfillments (
  id,
  business_id,
  order_id,
  type_code,
  location_id,
  release_state,
  estimated_weight_lbs,
  estimated_weight_source,
  version,
  created_at,
  updated_at
)
SELECT
  fulfillment_id,
  business_id,
  order_id,
  'wash_fold',
  'pressly-one',
  release_state,
  weight_lbs,
  CASE WHEN weight_lbs IS NULL THEN NULL ELSE 'source_estimate' END,
  1,
  now(),
  now()
FROM fixture_orders;

INSERT INTO order_source_links (
  id,
  source,
  external_order_id,
  order_id,
  created_at,
  updated_at
)
SELECT
  source_link_id,
  'cents',
  external_order_id,
  order_id,
  now(),
  now()
FROM fixture_orders;

INSERT INTO order_source_customer_refs (
  order_source_link_id,
  external_user_id,
  resolved_customer_id,
  resolution,
  observed_at,
  updated_at
)
SELECT
  fixture_order.source_link_id,
  CASE fixture_order.customer_resolution
    WHEN 'resolved' THEN fixture_user.external_user_id
    WHEN 'pending' THEN
      'LOCAL-PENDING-CUSTOMER-V1-'
      || lpad(fixture_order.ordinal::text, 3, '0')
    ELSE NULL
  END,
  CASE
    WHEN fixture_order.customer_resolution = 'resolved'
      THEN fixture_user.user_id
    ELSE NULL
  END,
  fixture_order.customer_resolution,
  now(),
  now()
FROM fixture_orders AS fixture_order
LEFT JOIN fixture_users AS fixture_user
  ON fixture_user.ordinal = fixture_order.customer_ordinal;

INSERT INTO order_source_snapshots (
  source_link_id,
  source_revision_at,
  source_revision_hash,
  adapter_version,
  source_lifecycle_code,
  normalized_payload_json,
  observed_at,
  created_at,
  updated_at
)
SELECT
  source_link_id,
  now() - make_interval(mins => ordinal),
  revision_hash,
  'local-processor-fixture-v1',
  source_status,
  jsonb_build_object(
    'externalOrderId', external_order_id,
    'orderCode', order_code,
    'status', source_status,
    'dueAt', due_at,
    'services', jsonb_build_array(
      jsonb_build_object(
        'name', 'Wash & Fold',
        'category', 'LAUNDRY',
        'unitPriceCents', 167,
        'totalPriceCents', total_amount_cents
      )
    ),
    'fixtureScenario', scenario
  ),
  now(),
  now(),
  now()
FROM fixture_orders;

INSERT INTO order_outbox_events (
  id,
  order_id,
  fulfillment_id,
  event_type,
  aggregate_version,
  payload_json,
  status,
  attempts,
  available_at,
  lease_owner,
  lease_expires_at,
  completed_at,
  dead_at,
  last_error_code,
  last_error_message,
  created_at
)
SELECT
  outbox_event_id,
  order_id,
  fulfillment_id,
  'fulfillment_demand_changed',
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'eventType', 'fulfillment_demand_changed',
    'fulfillmentId', fulfillment_id,
    'displayNumber', order_code,
    'locationId', 'pressly-one',
    'typeCode', 'wash_fold',
    'admissionState', admission_state,
    'commercialState', commercial_state,
    'dueAt', to_char(due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'estimatedWeightLbs', weight_lbs,
    'estimatedWeightSource',
      CASE WHEN weight_lbs IS NULL THEN NULL ELSE 'source_estimate' END,
    'bagCount', NULL,
    'version', 1,
    'observedAt',
      to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ),
  'completed',
  1,
  now(),
  NULL,
  NULL,
  now(),
  NULL,
  NULL,
  NULL,
  now()
FROM fixture_orders;

INSERT INTO order_demands (
  id,
  fulfillment_id,
  fulfillment_version,
  projection_hash,
  admission_state,
  commercial_state,
  display_reference,
  location_id,
  revision_at,
  phase,
  estimated_weight_lbs,
  estimated_weight_source,
  due_at,
  created_at,
  updated_at
)
SELECT
  demand_id,
  fulfillment_id,
  1,
  projection_hash,
  admission_state,
  commercial_state,
  order_code,
  'pressly-one',
  now() - make_interval(mins => ordinal),
  demand_phase,
  weight_lbs,
  CASE WHEN weight_lbs IS NULL THEN NULL ELSE 'external_estimate' END,
  due_at,
  now(),
  now()
FROM fixture_orders;

INSERT INTO production_orders (
  id,
  order_demand_id,
  location_id,
  due_at,
  priority,
  status,
  derived_weight_lbs,
  derived_weight_source,
  bag_count,
  bag_count_source,
  intake_recorded_at,
  intake_version,
  admission_override,
  admission_override_at,
  admission_override_by,
  must_stay_together,
  version,
  eligible_at,
  finished_at,
  pending_placement,
  created_at,
  updated_at
)
SELECT
  production_order_id,
  demand_id,
  'pressly-one',
  due_at,
  priority,
  production_status,
  weight_lbs,
  'external_estimate',
  bag_count,
  CASE WHEN bag_count IS NULL THEN NULL ELSE 'operator_intake' END,
  CASE
    WHEN bag_count IS NULL THEN NULL
    ELSE now() - make_interval(mins => ordinal)
  END,
  CASE WHEN bag_count IS NULL THEN 0 ELSE 1 END,
  CASE WHEN admission_override THEN 'released' ELSE NULL END,
  CASE WHEN admission_override THEN now() - interval '30 minutes' ELSE NULL END,
  CASE
    WHEN admission_override
      THEN 'f0000000-0000-4000-8000-000000000001'::uuid
    ELSE NULL
  END,
  true,
  CASE WHEN bag_count IS NULL THEN 1 ELSE 2 END,
  CASE
    WHEN production_status IN ('eligible', 'finished')
      THEN now() - make_interval(hours => 1, mins => ordinal)
    ELSE NULL
  END,
  CASE
    WHEN production_status = 'finished' THEN now() - interval '1 hour'
    ELSE NULL
  END,
  NULL,
  now(),
  now()
FROM fixture_orders
WHERE production_status IS NOT NULL;

INSERT INTO production_bags (
  id,
  production_order_id,
  bag_index,
  status
)
SELECT
  gen_random_uuid(),
  fixture_order.production_order_id,
  bag_index,
  CASE
    WHEN fixture_order.production_status = 'finished' THEN 'finished'
    ELSE 'eligible'
  END
FROM fixture_orders AS fixture_order
CROSS JOIN LATERAL generate_series(
  0,
  fixture_order.bag_count - 1
) AS bag_index
WHERE fixture_order.bag_count > 0;

COMMIT;

\echo
\echo 'Local Processor variable-order fixture loaded.'

SELECT
  CASE
    WHEN production_order.status IS NULL THEN 'forecast_missing_estimate'
    ELSE production_order.status
  END AS fixture_state,
  count(*) AS order_count,
  COALESCE(sum(demand.estimated_weight_lbs), 0) AS estimated_weight_lbs
FROM order_demands AS demand
LEFT JOIN production_orders AS production_order
  ON production_order.order_demand_id = demand.id
WHERE demand.display_reference LIKE 'TEST-%'
  AND demand.fulfillment_id IN (
    SELECT fulfillment.id
    FROM order_fulfillments AS fulfillment
    INNER JOIN order_source_links AS source_link
      ON source_link.order_id = fulfillment.order_id
    WHERE source_link.source = 'cents'
      AND source_link.external_order_id LIKE 'LOCAL-PROCESSOR-V1-%'
  )
GROUP BY fixture_state
ORDER BY fixture_state;

SELECT
  count(*) AS canonical_orders,
  count(*) FILTER (
    WHERE production_order.id IS NOT NULL
  ) AS production_orders,
  count(*) FILTER (
    WHERE production_order.status = 'release_pending'
  ) AS forecast_only,
  count(*) FILTER (
    WHERE production_order.status = 'intake_pending'
  ) AS needs_intake,
  count(*) FILTER (
    WHERE production_order.status = 'eligible'
  ) AS ready,
  count(*) FILTER (
    WHERE production_order.status = 'finished'
  ) AS finished
FROM orders AS canonical_order
INNER JOIN order_source_links AS source_link
  ON source_link.order_id = canonical_order.id
LEFT JOIN order_fulfillments AS fulfillment
  ON fulfillment.order_id = canonical_order.id
LEFT JOIN order_demands AS demand
  ON demand.fulfillment_id = fulfillment.id
LEFT JOIN production_orders AS production_order
  ON production_order.order_demand_id = demand.id
WHERE source_link.source = 'cents'
  AND source_link.external_order_id LIKE 'LOCAL-PROCESSOR-V1-%';
