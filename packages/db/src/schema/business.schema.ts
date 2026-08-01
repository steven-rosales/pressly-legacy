import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/**
 * The durable account boundary for business-owned data.
 *
 * Authentication identities may participate in more than one business over
 * time; workforce memberships and access grants express that relationship.
 */
export const businessAccounts = pgTable(
  'business_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('business_accounts_slug_unique').on(table.slug),
    check(
      'business_accounts_slug_shape',
      sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check(
      'business_accounts_status_valid',
      sql`${table.status} in ('active', 'suspended')`,
    ),
    check('business_accounts_positive_version', sql`${table.version} > 0`),
  ],
);

/**
 * Production owns location behavior. The table definition lives beside the
 * business root so every module can reference the same composite
 * (location_id, business_id) boundary without a schema import cycle.
 */
export const productionLocations = pgTable(
  'production_locations',
  {
    id: text('id').primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businessAccounts.id),
    name: text('name').notNull(),
    timezone: text('timezone').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    liveRevision: bigint('live_revision', { mode: 'number' })
      .notNull()
      .default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('production_locations_id_business_unique').on(
      table.id,
      table.businessId,
    ),
  ],
);
