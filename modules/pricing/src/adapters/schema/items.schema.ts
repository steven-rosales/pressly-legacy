import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core';
import { pricingSets } from './sets.schema.ts';

export type PricingItemMetadata = Readonly<{
  minimumThresholdQuantity?: number;
  displayUnitLabel?: string;
}>;

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
