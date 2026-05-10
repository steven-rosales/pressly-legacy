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

export const pricingLocations = pgTable('pricing_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  label: text('label').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pricingSets = pgTable('pricing_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id')
    .notNull()
    .references(() => pricingServices.id),
  locationId: uuid('location_id').references(() => pricingLocations.id),
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
