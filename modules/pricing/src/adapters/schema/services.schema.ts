import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
