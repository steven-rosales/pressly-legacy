import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export type PricingItemMetadata = Readonly<{
  minimumThresholdQuantity?: number;
  displayUnitLabel?: string;
}>;

/**
 * Pricing table dependency graph:
 *
 * pricing_services
 *   -> pricing_sets
 *        -> pricing_items
 *        -> pricing_change_events
 *
 * Services are stable catalogs. Pricing sets are versioned snapshots for a service. Pricing items are the actual money-bearing line items inside a pricing set. Pricing change events record publish actions from one pricing set to another.
 */

/**
 * Stable service catalog, such as `wash-fold` or `dry-cleaning`.
 *
 * This table identifies what kind of pricing can be requested. It should stay small and change rarely; historical pricing should point to services here instead of duplicating service identity on every pricing item.
 */
export const pricingServices = pgTable('pricing_services', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  kind: text('kind').notNull(),
  label: text('label').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Versioned pricing container for one service.
 *
 * Reads should choose the current active set by service and effective window. Price changes should publish a new set instead of mutating live item rows in place.
 */
export const pricingSets = pgTable('pricing_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id')
    .notNull()
    .references(() => pricingServices.id),
  status: text('status').notNull().default('active'),
  currency: text('currency').notNull().default('USD'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true })
    .notNull()
    .defaultNow(),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Money-bearing pricing lines inside a pricing set.
 *
 * Examples include `wash_fold_per_lb`, `delivery_fee`, `small_comforter`, and dry-cleaning garment prices. The `code` is the stable business key within a set; `priceCents` is stored as integer cents to avoid floating-point money errors.
 */
export const pricingItems = pgTable('pricing_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  pricingSetId: uuid('pricing_set_id')
    .notNull()
    .references(() => pricingSets.id),
  code: text('code').notNull(),
  service: text('service').notNull(),
  category: text('category').notNull(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  priceCents: integer('price_cents').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  metadata: jsonb('metadata')
    .$type<PricingItemMetadata>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Immutable audit record for a pricing publish action.
 *
 * This table makes the publishing model complete: a price change is not just a new row in `pricing_sets`; it is an actor-approved transition from one pricing set to another, with the original input and reason preserved. Both `oldPricingSetId` and `newPricingSetId` point to `pricing_sets` so the system can explain what changed, who changed it, and why.
 */
export const pricingChangeEvents = pgTable('pricing_change_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  actorId: text('actor_id').notNull(),
  actorKind: text('actor_kind').notNull(),
  actorDisplayName: text('actor_display_name').notNull(),
  serviceSlug: text('service_slug').notNull(),
  reason: text('reason').notNull(),
  oldPricingSetId: uuid('old_pricing_set_id')
    .notNull()
    .references(() => pricingSets.id),
  newPricingSetId: uuid('new_pricing_set_id')
    .notNull()
    .references(() => pricingSets.id),
  input: jsonb('input').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
