# Pricing Data Model

Quick reference for the pricing schema and table relationships.

## Shape

```txt
pricing_services
  1 -> many pricing_sets

pricing_locations
  1 -> many pricing_sets
  optional on pricing_sets

pricing_sets
  1 -> many pricing_items
  1 -> many pricing_change_events as old_pricing_set_id
  1 -> many pricing_change_events as new_pricing_set_id
```

## Tables

### `pricing_services`

Stable service catalog.

Examples: `wash-fold`, `dry-cleaning`.

Key columns:

- `slug`
- `kind`
- `label`
- `is_active`

### `pricing_locations`

Stable location catalog for location-specific pricing.

When `pricing_sets.location_id` is `null`, the set is the default service price.

Key columns:

- `slug`
- `label`
- `is_active`

### `pricing_sets`

Versioned pricing snapshot for one service and optional location.

Publishing a price change creates a new set instead of mutating live item rows.

Key columns:

- `service_id`
- `location_id`
- `status`
- `currency`
- `effective_from`
- `effective_to`

### `pricing_items`

Money-bearing lines inside a pricing set.

Examples: `wash_fold_per_lb`, `delivery_fee`, `small_comforter`, `pants`.

Key columns:

- `pricing_set_id`
- `code`
- `service`
- `category`
- `name`
- `unit`
- `price_cents`
- `sort_order`
- `metadata`

### `pricing_change_events`

Immutable audit trail for a pricing publish action.

It records who changed pricing, why, the original command input, and the transition from old set to new set.

Key columns:

- `kind`
- `actor_id`
- `actor_kind`
- `actor_display_name`
- `service_slug`
- `location_slug`
- `reason`
- `old_pricing_set_id`
- `new_pricing_set_id`
- `input`

## Read Rule

Load the current active set by:

1. service
2. optional location
3. effective window

If no location-specific set exists, use the default service set.

## Write Rule

Never mutate active item prices in place.

To publish a change:

1. archive the current set
2. create a new active set
3. copy existing items into the new set
4. apply changed item prices
5. insert a `pricing_change_events` row
