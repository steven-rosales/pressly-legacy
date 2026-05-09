import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pricingLocations } from './locations.schema.ts';
import { pricingServices } from './services.schema.ts';

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
