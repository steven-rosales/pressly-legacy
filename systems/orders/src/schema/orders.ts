import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const makeOrdersSchema = () => {
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

  const orders = pgTable(
    'orders',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      businessId: uuid('business_id').notNull(),
      customerId: uuid('customer_id'),
      customerVersion: integer('customer_version'),
      customerFirstName: text('customer_first_name'),
      customerLastName: text('customer_last_name'),
      customerBusinessName: text('customer_business_name'),
      customerPhone: text('customer_phone'),
      customerEmail: text('customer_email'),
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
      unique('orders_id_business_unique').on(table.id, table.businessId),
      index('orders_business_due_state_idx').on(
        table.businessId,
        table.dueAt,
        table.state,
      ),
      index('orders_customer_idx').on(table.customerId),
      index('orders_due_state_idx').on(table.dueAt, table.state),
      check(
        'orders_customer_resolution_valid',
        sql`${table.customerResolution} in ('resolved', 'not_provided', 'pending', 'conflict')`,
      ),
      check(
        'orders_customer_resolution_consistent',
        sql`(${table.customerResolution} = 'resolved' and ${table.customerId} is not null and ${table.customerVersion} is not null and ${table.customerVersion} > 0) or (${table.customerResolution} <> 'resolved' and ${table.customerId} is null and ${table.customerVersion} is null and ${table.customerFirstName} is null and ${table.customerLastName} is null and ${table.customerBusinessName} is null and ${table.customerPhone} is null and ${table.customerEmail} is null)`,
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

  const orderItems = pgTable(
    'order_items',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      businessId: uuid('business_id').notNull(),
      orderId: uuid('order_id').notNull(),
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
      uniqueIndex('order_items_id_business_unique').on(
        table.id,
        table.businessId,
      ),
      foreignKey({
        name: 'order_items_order_business_fk',
        columns: [table.orderId, table.businessId],
        foreignColumns: [orders.id, orders.businessId],
      }).onDelete('cascade'),
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

  const orderFulfillments = pgTable(
    'order_fulfillments',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      businessId: uuid('business_id').notNull(),
      orderId: uuid('order_id').notNull(),
      typeCode: text('type_code').notNull(),
      locationId: text('location_id').notNull(),
      releaseState: text('release_state').notNull().default('unreleased'),
      estimatedWeightLbs: weight('estimated_weight_lbs'),
      estimatedWeightSource: text('estimated_weight_source'),
      version: integer('version').notNull().default(1),
      ...timestamps,
    },
    (table) => [
      uniqueIndex('order_fulfillments_id_business_unique').on(
        table.id,
        table.businessId,
      ),
      foreignKey({
        name: 'order_fulfillments_order_business_fk',
        columns: [table.orderId, table.businessId],
        foreignColumns: [orders.id, orders.businessId],
      }).onDelete('cascade'),
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
      check('order_fulfillments_positive_version', sql`${table.version} > 0`),
    ],
  );

  const orderSourceLinks = pgTable(
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
      uniqueIndex('order_source_links_id_identity_unique').on(
        table.id,
        table.source,
        table.externalOrderId,
      ),
      index('order_source_links_order_idx').on(table.orderId),
    ],
  );

  const orderSourceProposals = pgTable(
    'order_source_proposals',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      source: text('source').notNull(),
      externalOrderId: text('external_order_id').notNull(),
      locationId: text('location_id').notNull(),
      proposalKind: text('proposal_kind').notNull(),
      sourceRevisionAt: timestamp('source_revision_at', {
        withTimezone: true,
      }).notNull(),
      sourceRevisionHash: text('source_revision_hash').notNull(),
      adapterVersion: text('adapter_version').notNull(),
      proposalSnapshot: jsonb('proposal_snapshot_json').notNull(),
      customerDisplayName: text('customer_display_name'),
      customerPhone: text('customer_phone'),
      customerEmail: text('customer_email'),
      displayNumber: text('display_number'),
      dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
      estimatedWeightLbs: weight('estimated_weight_lbs'),
      observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
      state: text('state').notNull().default('pending'),
      version: integer('version').notNull().default(1),
      createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex('order_source_proposals_source_identity_unique').on(
        table.source,
        table.externalOrderId,
      ),
      index('order_source_proposals_location_observed_idx').on(
        table.locationId,
        table.observedAt,
        table.id,
      ),
      index('order_source_proposals_location_state_observed_idx').on(
        table.locationId,
        table.state,
        table.observedAt,
        table.id,
      ),
      check(
        'order_source_proposals_identity_present',
        sql`length(btrim(${table.source})) > 0 and length(btrim(${table.externalOrderId})) > 0 and length(btrim(${table.locationId})) > 0 and length(btrim(${table.adapterVersion})) > 0`,
      ),
      check(
        'order_source_proposals_kind_valid',
        sql`${table.proposalKind} in ('pickup', 'submitted_order')`,
      ),
      check(
        'order_source_proposals_hash_shape',
        sql`${table.sourceRevisionHash} ~ '^[a-f0-9]{64}$'`,
      ),
      check(
        'order_source_proposals_snapshot_object',
        sql`jsonb_typeof(${table.proposalSnapshot}) = 'object'`,
      ),
      check(
        'order_source_proposals_weight_positive',
        sql`${table.estimatedWeightLbs} is null or ${table.estimatedWeightLbs} > 0`,
      ),
      check(
        'order_source_proposals_state_valid',
        sql`${table.state} in ('pending', 'source_closed', 'restored_pending', 'accepted', 'rejected')`,
      ),
      check(
        'order_source_proposals_positive_version',
        sql`${table.version} > 0`,
      ),
    ],
  );

  const orderSourceProposalResolutions = pgTable(
    'order_source_proposal_resolutions',
    {
      proposalId: uuid('proposal_id')
        .primaryKey()
        .references(() => orderSourceProposals.id),
      decision: text('decision').notNull(),
      proposalVersion: integer('proposal_version').notNull(),
      orderId: uuid('order_id').references(() => orders.id),
      fulfillmentId: uuid('fulfillment_id').references(
        () => orderFulfillments.id,
      ),
      idempotencyKey: text('idempotency_key').notNull(),
      commandHash: text('command_hash').notNull(),
      origin: text('origin').notNull(),
      actorKind: text('actor_kind').notNull(),
      actorId: text('actor_id').notNull(),
      reasonCode: text('reason_code').notNull(),
      reasonNote: text('reason_note'),
      decidedAt: timestamp('decided_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex('order_source_proposal_resolutions_idempotency_unique').on(
        table.idempotencyKey,
      ),
      index('order_source_proposal_resolutions_order_idx').on(table.orderId),
      check(
        'order_source_proposal_resolutions_decision_valid',
        sql`${table.decision} in ('accepted', 'rejected')`,
      ),
      check(
        'order_source_proposal_resolutions_version_valid',
        sql`${table.proposalVersion} > 1`,
      ),
      check(
        'order_source_proposal_resolutions_effect_consistent',
        sql`(${table.decision} = 'accepted' and ${table.orderId} is not null and ${table.fulfillmentId} is not null) or (${table.decision} = 'rejected' and ${table.orderId} is null and ${table.fulfillmentId} is null)`,
      ),
      check(
        'order_source_proposal_resolutions_command_hash_shape',
        sql`${table.commandHash} ~ '^[a-f0-9]{64}$'`,
      ),
      check(
        'order_source_proposal_resolutions_actor_kind_valid',
        sql`${table.actorKind} in ('human', 'service', 'system')`,
      ),
      check(
        'order_source_proposal_resolutions_context_present',
        sql`length(btrim(${table.idempotencyKey})) > 0 and length(btrim(${table.origin})) > 0 and length(btrim(${table.actorId})) > 0 and length(btrim(${table.reasonCode})) > 0 and (${table.reasonNote} is null or length(btrim(${table.reasonNote})) > 0)`,
      ),
    ],
  );

  const orderSourceProposalTransitions = pgTable(
    'order_source_proposal_transitions',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      proposalId: uuid('proposal_id')
        .notNull()
        .references(() => orderSourceProposals.id),
      fromState: text('from_state').notNull(),
      toState: text('to_state').notNull(),
      eventType: text('event_type').notNull(),
      proposalVersion: integer('proposal_version').notNull(),
      idempotencyKey: text('idempotency_key').notNull(),
      commandHash: text('command_hash').notNull(),
      origin: text('origin').notNull(),
      actorKind: text('actor_kind').notNull(),
      actorId: text('actor_id').notNull(),
      reasonCode: text('reason_code').notNull(),
      reasonNote: text('reason_note'),
      sourceTerminalCode: text('source_terminal_code'),
      occurredAt: timestamp('occurred_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex('order_source_proposal_transitions_version_unique').on(
        table.proposalId,
        table.proposalVersion,
      ),
      uniqueIndex('order_source_proposal_transitions_idempotency_unique').on(
        table.idempotencyKey,
      ),
      index('order_source_proposal_transitions_proposal_occurred_idx').on(
        table.proposalId,
        table.occurredAt,
      ),
      check(
        'order_source_proposal_transitions_states_valid',
        sql`${table.fromState} in ('pending', 'source_closed', 'restored_pending') and ${table.toState} in ('source_closed', 'restored_pending', 'accepted', 'rejected')`,
      ),
      check(
        'order_source_proposal_transitions_event_valid',
        sql`${table.eventType} in ('accept', 'reject', 'source_close', 'restore')`,
      ),
      check(
        'order_source_proposal_transitions_edge_consistent',
        sql`(${table.fromState} = 'pending' and ${table.eventType} = 'accept' and ${table.toState} = 'accepted') or (${table.fromState} = 'pending' and ${table.eventType} = 'reject' and ${table.toState} = 'rejected') or (${table.fromState} = 'pending' and ${table.eventType} = 'source_close' and ${table.toState} = 'source_closed') or (${table.fromState} = 'source_closed' and ${table.eventType} = 'restore' and ${table.toState} = 'restored_pending') or (${table.fromState} = 'restored_pending' and ${table.eventType} = 'accept' and ${table.toState} = 'accepted') or (${table.fromState} = 'restored_pending' and ${table.eventType} = 'reject' and ${table.toState} = 'rejected')`,
      ),
      check(
        'order_source_proposal_transitions_version_valid',
        sql`${table.proposalVersion} > 1`,
      ),
      check(
        'order_source_proposal_transitions_command_hash_shape',
        sql`${table.commandHash} ~ '^[a-f0-9]{64}$'`,
      ),
      check(
        'order_source_proposal_transitions_actor_kind_valid',
        sql`${table.actorKind} in ('human', 'service', 'system')`,
      ),
      check(
        'order_source_proposal_transitions_context_present',
        sql`length(btrim(${table.idempotencyKey})) > 0 and length(btrim(${table.origin})) > 0 and length(btrim(${table.actorId})) > 0 and length(btrim(${table.reasonCode})) > 0 and (${table.reasonNote} is null or length(btrim(${table.reasonNote})) > 0)`,
      ),
      check(
        'order_source_proposal_transitions_terminal_consistent',
        sql`(${table.eventType} = 'source_close' and ${table.sourceTerminalCode} in ('completed', 'canceled')) or (${table.eventType} <> 'source_close' and ${table.sourceTerminalCode} is null)`,
      ),
    ],
  );

  const orderSourceTerminalTombstones = pgTable(
    'order_source_terminal_tombstones',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      source: text('source').notNull(),
      externalOrderId: text('external_order_id').notNull(),
      proposalId: uuid('proposal_id').references(() => orderSourceProposals.id),
      terminalCode: text('terminal_code').notNull(),
      sourceRevisionAt: timestamp('source_revision_at', {
        withTimezone: true,
      }).notNull(),
      sourceRevisionHash: text('source_revision_hash').notNull(),
      adapterVersion: text('adapter_version').notNull(),
      normalizedPayload: jsonb('normalized_payload_json').notNull(),
      observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
      createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex('order_source_terminal_tombstones_identity_unique').on(
        table.source,
        table.externalOrderId,
      ),
      index('order_source_terminal_tombstones_proposal_idx').on(
        table.proposalId,
      ),
      check(
        'order_source_terminal_tombstones_identity_present',
        sql`length(btrim(${table.source})) > 0 and length(btrim(${table.externalOrderId})) > 0 and length(btrim(${table.adapterVersion})) > 0`,
      ),
      check(
        'order_source_terminal_tombstones_code_valid',
        sql`${table.terminalCode} in ('completed', 'canceled')`,
      ),
      check(
        'order_source_terminal_tombstones_hash_shape',
        sql`${table.sourceRevisionHash} ~ '^[a-f0-9]{64}$'`,
      ),
      check(
        'order_source_terminal_tombstones_payload_object',
        sql`jsonb_typeof(${table.normalizedPayload}) = 'object'`,
      ),
    ],
  );

  const orderSourceCustomerRefs = pgTable(
    'order_source_customer_refs',
    {
      orderSourceLinkId: uuid('order_source_link_id')
        .primaryKey()
        .references(() => orderSourceLinks.id, { onDelete: 'cascade' }),
      externalUserId: text('external_user_id'),
      resolvedCustomerId: uuid('resolved_customer_id'),
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
        sql`${table.resolution} in ('resolved', 'not_provided', 'pending', 'conflict')`,
      ),
      check(
        'order_source_customer_refs_resolution_consistent',
        sql`(${table.resolution} = 'resolved' and ${table.externalUserId} is not null and ${table.resolvedCustomerId} is not null) or (${table.resolution} = 'not_provided' and ${table.externalUserId} is null and ${table.resolvedCustomerId} is null) or (${table.resolution} in ('pending', 'conflict') and ${table.externalUserId} is not null and ${table.resolvedCustomerId} is null)`,
      ),
    ],
  );

  const orderSourceSnapshots = pgTable(
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

  const orderCommandReceipts = pgTable(
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
      reasonCode: text('reason_code'),
      reasonNote: text('reason_note'),
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
      check(
        'order_command_receipts_reason_consistent',
        sql`(${table.reasonCode} is null and ${table.reasonNote} is null) or (${table.reasonCode} is not null and length(btrim(${table.reasonCode})) > 0 and (${table.reasonNote} is null or length(btrim(${table.reasonNote})) > 0))`,
      ),
    ],
  );

  const orderOutboxEvents = pgTable(
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

  return Object.freeze({
    orders,
    orderItems,
    orderFulfillments,
    orderSourceLinks,
    orderSourceProposals,
    orderSourceProposalResolutions,
    orderSourceProposalTransitions,
    orderSourceTerminalTombstones,
    orderSourceCustomerRefs,
    orderSourceSnapshots,
    orderCommandReceipts,
    orderOutboxEvents,
  });
};

export type OrdersSchema = ReturnType<typeof makeOrdersSchema>;
