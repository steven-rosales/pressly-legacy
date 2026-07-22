import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema.ts';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

const weight = (name: string) =>
  numeric(name, { precision: 12, scale: 3, mode: 'number' });

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerUserId: uuid('customer_user_id').references(() => users.id),
    customerResolution: text('customer_resolution').notNull(),
    displayNumber: text('display_number'),
    state: text('state').notNull().default('open'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    currency: text('currency').notNull().default('USD'),
    totalAmountCents: integer('total_amount_cents').notNull().default(0),
    balanceDueCents: integer('balance_due_cents'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index('orders_customer_idx').on(table.customerUserId),
    index('orders_due_state_idx').on(table.dueAt, table.state),
    check(
      'orders_customer_resolution_valid',
      sql`${table.customerResolution} in ('resolved', 'not_provided', 'pending', 'conflict', 'legacy_unknown')`,
    ),
    check(
      'orders_customer_resolution_consistent',
      sql`(${table.customerResolution} = 'resolved' and ${table.customerUserId} is not null) or (${table.customerResolution} <> 'resolved' and ${table.customerUserId} is null)`,
    ),
    check(
      'orders_state_valid',
      sql`${table.state} in ('open', 'completed', 'canceled')`,
    ),
    check('orders_currency_shape', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      'orders_amounts_nonnegative',
      sql`${table.totalAmountCents} >= 0 and (${table.balanceDueCents} is null or ${table.balanceDueCents} >= 0)`,
    ),
    check('orders_positive_version', sql`${table.version} > 0`),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    lineKey: text('line_key').notNull(),
    itemType: text('item_type').notNull().default('service'),
    code: text('code').notNull(),
    description: text('description').notNull(),
    quantity: numeric('quantity', {
      precision: 14,
      scale: 3,
      mode: 'number',
    }).notNull(),
    unit: text('unit').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    totalAmountCents: integer('total_amount_cents').notNull(),
    sourceMetadata: jsonb('source_metadata_json')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('order_items_order_line_unique').on(
      table.orderId,
      table.lineKey,
    ),
    check(
      'order_items_values_nonnegative',
      sql`${table.quantity} >= 0 and ${table.unitPriceCents} >= 0 and ${table.totalAmountCents} >= 0`,
    ),
  ],
);

export const orderFulfillments = pgTable(
  'order_fulfillments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    typeCode: text('type_code').notNull(),
    locationId: text('location_id').notNull(),
    releaseState: text('release_state').notNull().default('unreleased'),
    estimatedWeightLbs: weight('estimated_weight_lbs'),
    estimatedWeightSource: text('estimated_weight_source'),
    bagCount: integer('bag_count'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('order_fulfillments_order_type_unique').on(
      table.orderId,
      table.typeCode,
    ),
    index('order_fulfillments_location_release_idx').on(
      table.locationId,
      table.releaseState,
    ),
    check(
      'order_fulfillments_release_state_valid',
      sql`${table.releaseState} in ('unreleased', 'released', 'withdrawn')`,
    ),
    check(
      'order_fulfillments_weight_positive',
      sql`${table.estimatedWeightLbs} is null or ${table.estimatedWeightLbs} > 0`,
    ),
    check(
      'order_fulfillments_weight_provenance_consistent',
      sql`(${table.estimatedWeightLbs} is null) = (${table.estimatedWeightSource} is null)`,
    ),
    check(
      'order_fulfillments_bag_count_nonnegative',
      sql`${table.bagCount} is null or ${table.bagCount} >= 0`,
    ),
    check('order_fulfillments_positive_version', sql`${table.version} > 0`),
  ],
);

export const orderSourceLinks = pgTable(
  'order_source_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    externalOrderId: text('external_order_id').notNull(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('order_source_links_source_identity_unique').on(
      table.source,
      table.externalOrderId,
    ),
    index('order_source_links_order_idx').on(table.orderId),
  ],
);

export const orderSourceCustomerRefs = pgTable(
  'order_source_customer_refs',
  {
    orderSourceLinkId: uuid('order_source_link_id')
      .primaryKey()
      .references(() => orderSourceLinks.id, { onDelete: 'cascade' }),
    externalUserId: text('external_user_id'),
    resolvedUserId: uuid('resolved_user_id').references(() => users.id),
    resolution: text('resolution').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('order_source_customer_refs_external_idx').on(table.externalUserId),
    check(
      'order_source_customer_refs_resolution_valid',
      sql`${table.resolution} in ('resolved', 'not_provided', 'pending', 'conflict', 'legacy_unknown')`,
    ),
    check(
      'order_source_customer_refs_resolution_consistent',
      sql`(${table.resolution} = 'resolved' and ${table.externalUserId} is not null and ${table.resolvedUserId} is not null) or (${table.resolution} = 'not_provided' and ${table.externalUserId} is null and ${table.resolvedUserId} is null) or (${table.resolution} in ('pending', 'conflict') and ${table.externalUserId} is not null and ${table.resolvedUserId} is null) or (${table.resolution} = 'legacy_unknown' and ${table.resolvedUserId} is null)`,
    ),
  ],
);

export const orderSourceSnapshots = pgTable(
  'order_source_snapshots',
  {
    sourceLinkId: uuid('source_link_id')
      .primaryKey()
      .references(() => orderSourceLinks.id, { onDelete: 'cascade' }),
    sourceRevisionAt: timestamp('source_revision_at', {
      withTimezone: true,
    }).notNull(),
    sourceRevisionHash: text('source_revision_hash').notNull(),
    adapterVersion: text('adapter_version').notNull(),
    sourceLifecycleCode: text('source_lifecycle_code'),
    normalizedPayload: jsonb('normalized_payload_json').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      'order_source_snapshots_hash_shape',
      sql`${table.sourceRevisionHash} ~ '^[a-f0-9]{64}$'`,
    ),
    index('order_source_snapshots_revision_idx').on(table.sourceRevisionAt),
  ],
);

export const orderFieldAuthorities = pgTable(
  'order_field_authorities',
  {
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fieldName: text('field_name').notNull(),
    authority: text('authority').notNull(),
    source: text('source'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.orderId, table.fieldName] }),
    check(
      'order_field_authorities_valid',
      sql`(${table.authority} = 'pressly' and ${table.source} is null) or (${table.authority} = 'source' and ${table.source} is not null)`,
    ),
  ],
);

export const orderCommandReceipts = pgTable(
  'order_command_receipts',
  {
    idempotencyKey: text('idempotency_key').primaryKey(),
    commandHash: text('command_hash').notNull(),
    origin: text('origin').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id').notNull(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    result: jsonb('result_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'order_command_receipts_actor_kind_valid',
      sql`${table.actorKind} in ('human', 'service', 'system')`,
    ),
    check(
      'order_command_receipts_context_present',
      sql`length(trim(${table.origin})) > 0 and length(trim(${table.actorId})) > 0`,
    ),
  ],
);

export const orderOutboxEvents = pgTable(
  'order_outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    fulfillmentId: uuid('fulfillment_id')
      .notNull()
      .references(() => orderFulfillments.id),
    eventType: text('event_type').notNull(),
    aggregateVersion: integer('aggregate_version').notNull(),
    payload: jsonb('payload_json').notNull(),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    deadAt: timestamp('dead_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('order_outbox_events_version_unique').on(
      table.orderId,
      table.fulfillmentId,
      table.aggregateVersion,
      table.eventType,
    ),
    index('order_outbox_events_claimable_idx').on(
      table.status,
      table.availableAt,
      table.leaseExpiresAt,
    ),
    check(
      'order_outbox_events_status_valid',
      sql`${table.status} in ('pending', 'processing', 'completed', 'dead')`,
    ),
    check(
      'order_outbox_events_attempts_nonnegative',
      sql`${table.attempts} >= 0`,
    ),
    check(
      'order_outbox_events_positive_version',
      sql`${table.aggregateVersion} > 0`,
    ),
    check(
      'order_outbox_events_lease_consistent',
      sql`(${table.status} = 'processing' and ${table.leaseOwner} is not null and ${table.leaseExpiresAt} is not null and ${table.completedAt} is null and ${table.deadAt} is null) or (${table.status} = 'pending' and ${table.leaseOwner} is null and ${table.leaseExpiresAt} is null and ${table.completedAt} is null and ${table.deadAt} is null) or (${table.status} = 'completed' and ${table.leaseOwner} is null and ${table.leaseExpiresAt} is null and ${table.completedAt} is not null and ${table.deadAt} is null) or (${table.status} = 'dead' and ${table.leaseOwner} is null and ${table.leaseExpiresAt} is null and ${table.completedAt} is null and ${table.deadAt} is not null)`,
    ),
  ],
);
