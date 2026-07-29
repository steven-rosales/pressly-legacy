import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
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
    uniqueIndex('order_source_links_id_identity_unique').on(
      table.id,
      table.source,
      table.externalOrderId,
    ),
    index('order_source_links_order_idx').on(table.orderId),
  ],
);

export const orderSourceProposals = pgTable(
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
    check('order_source_proposals_positive_version', sql`${table.version} > 0`),
  ],
);

export const orderSourceProposalResolutions = pgTable(
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

export const orderSourceProposalTransitions = pgTable(
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

export const orderSourceTerminalTombstones = pgTable(
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
    index('order_source_terminal_tombstones_proposal_idx').on(table.proposalId),
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

export const orderSourceCapabilityProfiles = pgTable(
  'order_source_capability_profiles',
  {
    source: text('source').notNull(),
    profileVersion: text('profile_version').notNull(),
    policyVersion: text('policy_version').notNull(),
    capabilityDefinition: jsonb('capability_definition_json').notNull(),
    definitionHash: text('definition_hash').notNull(),
    createdByActorKind: text('created_by_actor_kind').notNull(),
    createdByActorId: text('created_by_actor_id').notNull(),
    reasonCode: text('reason_code').notNull(),
    reasonNote: text('reason_note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'order_source_capability_profiles_pk',
      columns: [table.source, table.profileVersion],
    }),
    check(
      'order_source_capability_profiles_identity_present',
      sql`length(btrim(${table.source})) > 0 and length(btrim(${table.profileVersion})) > 0 and length(btrim(${table.policyVersion})) > 0`,
    ),
    check(
      'order_source_capability_profiles_definition_object',
      sql`jsonb_typeof(${table.capabilityDefinition}) = 'object'`,
    ),
    check(
      'order_source_capability_profiles_hash_shape',
      sql`${table.definitionHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'order_source_capability_profiles_actor_kind_valid',
      sql`${table.createdByActorKind} in ('human', 'service', 'system')`,
    ),
    check(
      'order_source_capability_profiles_context_present',
      sql`length(btrim(${table.createdByActorId})) > 0 and length(btrim(${table.reasonCode})) > 0 and (${table.reasonNote} is null or length(btrim(${table.reasonNote})) > 0)`,
    ),
  ],
);

export const orderSourceControlRevisions = pgTable(
  'order_source_control_revisions',
  {
    source: text('source').notNull(),
    locationId: text('location_id').notNull(),
    version: integer('version').notNull(),
    profileVersion: text('profile_version').notNull(),
    fromPosture: text('from_posture'),
    posture: text('posture').notNull(),
    eventType: text('event_type').notNull(),
    changedByActorKind: text('changed_by_actor_kind').notNull(),
    changedByActorId: text('changed_by_actor_id').notNull(),
    reasonCode: text('reason_code').notNull(),
    reasonNote: text('reason_note'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'order_source_control_revisions_pk',
      columns: [table.source, table.locationId, table.version],
    }),
    foreignKey({
      name: 'order_source_control_revisions_profile_fk',
      columns: [table.source, table.profileVersion],
      foreignColumns: [
        orderSourceCapabilityProfiles.source,
        orderSourceCapabilityProfiles.profileVersion,
      ],
    }),
    index('order_source_control_revisions_location_source_version_idx').on(
      table.locationId,
      table.source,
      table.version,
    ),
    check(
      'order_source_control_revisions_identity_present',
      sql`length(btrim(${table.source})) > 0 and length(btrim(${table.locationId})) > 0 and length(btrim(${table.profileVersion})) > 0`,
    ),
    check(
      'order_source_control_revisions_positive_version',
      sql`${table.version} > 0`,
    ),
    check(
      'order_source_control_revisions_posture_valid',
      sql`${table.posture} in ('normal', 'observe_only', 'blocked') and (${table.fromPosture} is null or ${table.fromPosture} in ('normal', 'observe_only', 'blocked'))`,
    ),
    check(
      'order_source_control_revisions_event_valid',
      sql`${table.eventType} in ('initialize', 'degrade_to_observe_only', 'block', 'restore_to_observe_only', 'restore_to_normal')`,
    ),
    check(
      'order_source_control_revisions_initialization_consistent',
      sql`(${table.version} = 1 and ${table.eventType} = 'initialize' and ${table.fromPosture} is null) or (${table.version} > 1 and ${table.eventType} <> 'initialize' and ${table.fromPosture} is not null)`,
    ),
    check(
      'order_source_control_revisions_transition_consistent',
      sql`(${table.eventType} = 'initialize') or (${table.eventType} = 'degrade_to_observe_only' and ${table.fromPosture} = 'normal' and ${table.posture} = 'observe_only') or (${table.eventType} = 'block' and ${table.fromPosture} in ('normal', 'observe_only') and ${table.posture} = 'blocked') or (${table.eventType} = 'restore_to_observe_only' and ${table.fromPosture} = 'blocked' and ${table.posture} = 'observe_only') or (${table.eventType} = 'restore_to_normal' and ${table.fromPosture} = 'observe_only' and ${table.posture} = 'normal')`,
    ),
    check(
      'order_source_control_revisions_actor_kind_valid',
      sql`${table.changedByActorKind} in ('human', 'service', 'system')`,
    ),
    check(
      'order_source_control_revisions_context_present',
      sql`length(btrim(${table.changedByActorId})) > 0 and length(btrim(${table.reasonCode})) > 0 and (${table.reasonNote} is null or length(btrim(${table.reasonNote})) > 0)`,
    ),
  ],
);

export const orderSourceObservationDecisions = pgTable(
  'order_source_observation_decisions',
  {
    evaluationKey: text('evaluation_key').primaryKey(),
    sourceLinkId: uuid('source_link_id'),
    source: text('source').notNull(),
    externalOrderId: text('external_order_id').notNull(),
    locationId: text('location_id').notNull(),
    sourceRevisionAt: timestamp('source_revision_at', {
      withTimezone: true,
    }).notNull(),
    sourceRevisionHash: text('source_revision_hash').notNull(),
    adapterVersion: text('adapter_version').notNull(),
    sourceLifecycleCode: text('source_lifecycle_code'),
    configurationStatus: text('configuration_status').notNull(),
    profileVersion: text('profile_version'),
    controlVersion: integer('control_version'),
    policyVersion: text('policy_version').notNull(),
    evaluationMode: text('evaluation_mode').notNull(),
    revisionClassification: text('revision_classification').notNull(),
    claimPhase: text('claim_phase').notNull(),
    overallDisposition: text('overall_disposition'),
    assuranceDemotion: integer('assurance_demotion').notNull(),
    claimDecisions: jsonb('claim_decisions_json').notNull(),
    reasonCodes: jsonb('reason_codes_json').notNull(),
    proposedFields: jsonb('proposed_fields_json').notNull(),
    adoptedFields: jsonb('adopted_fields_json').notNull(),
    canonicalEffect: text('canonical_effect').notNull(),
    orderVersionBefore: integer('order_version_before'),
    orderVersionAfter: integer('order_version_after'),
    fulfillmentVersionBefore: integer('fulfillment_version_before'),
    fulfillmentVersionAfter: integer('fulfillment_version_after'),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'order_source_observation_decisions_source_link_fk',
      columns: [table.sourceLinkId, table.source, table.externalOrderId],
      foreignColumns: [
        orderSourceLinks.id,
        orderSourceLinks.source,
        orderSourceLinks.externalOrderId,
      ],
    }),
    foreignKey({
      name: 'order_source_observation_decisions_profile_fk',
      columns: [table.source, table.profileVersion],
      foreignColumns: [
        orderSourceCapabilityProfiles.source,
        orderSourceCapabilityProfiles.profileVersion,
      ],
    }),
    foreignKey({
      name: 'order_source_observation_decisions_control_fk',
      columns: [table.source, table.locationId, table.controlVersion],
      foreignColumns: [
        orderSourceControlRevisions.source,
        orderSourceControlRevisions.locationId,
        orderSourceControlRevisions.version,
      ],
    }),
    index('order_source_observation_decisions_source_revision_idx').on(
      table.source,
      table.externalOrderId,
      table.sourceRevisionAt,
    ),
    index('order_source_observation_decisions_location_evaluated_idx').on(
      table.locationId,
      table.evaluatedAt,
    ),
    check(
      'order_source_observation_decisions_evaluation_key_shape',
      sql`${table.evaluationKey} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'order_source_observation_decisions_identity_present',
      sql`length(btrim(${table.source})) > 0 and length(btrim(${table.externalOrderId})) > 0 and length(btrim(${table.locationId})) > 0 and length(btrim(${table.adapterVersion})) > 0 and length(btrim(${table.policyVersion})) > 0`,
    ),
    check(
      'order_source_observation_decisions_revision_hash_shape',
      sql`${table.sourceRevisionHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'order_source_observation_decisions_configuration_consistent',
      sql`(${table.configurationStatus} = 'configured' and ${table.profileVersion} is not null and length(btrim(${table.profileVersion})) > 0 and ${table.controlVersion} is not null and ${table.controlVersion} > 0) or (${table.configurationStatus} = 'unconfigured' and ${table.profileVersion} is null and ${table.controlVersion} is null)`,
    ),
    check(
      'order_source_observation_decisions_mode_valid',
      sql`${table.evaluationMode} in ('shadow', 'enforced')`,
    ),
    check(
      'order_source_observation_decisions_revision_valid',
      sql`${table.revisionClassification} in ('newer', 'replay', 'stale', 'conflict')`,
    ),
    check(
      'order_source_observation_decisions_phase_valid',
      sql`${table.claimPhase} in ('creation', 'unreleased', 'released', 'terminal')`,
    ),
    check(
      'order_source_observation_decisions_disposition_valid',
      sql`(${table.revisionClassification} = 'newer' and ${table.overallDisposition} in ('deny', 'observe', 'propose', 'auto_adopt')) or (${table.revisionClassification} <> 'newer' and ${table.overallDisposition} is null)`,
    ),
    check(
      'order_source_observation_decisions_unconfigured_denied',
      sql`${table.configurationStatus} = 'configured' or (${table.revisionClassification} = 'newer' and ${table.overallDisposition} = 'deny') or (${table.revisionClassification} <> 'newer' and ${table.overallDisposition} is null)`,
    ),
    check(
      'order_source_observation_decisions_assurance_valid',
      sql`${table.assuranceDemotion} between 0 and 3`,
    ),
    check(
      'order_source_observation_decisions_evidence_arrays',
      sql`jsonb_typeof(${table.claimDecisions}) = 'array' and jsonb_typeof(${table.reasonCodes}) = 'array' and jsonb_array_length(${table.reasonCodes}) > 0 and jsonb_typeof(${table.proposedFields}) = 'array' and jsonb_typeof(${table.adoptedFields}) = 'array'`,
    ),
    check(
      'order_source_observation_decisions_effect_valid',
      sql`${table.canonicalEffect} in ('none', 'canonical_created', 'canonical_updated')`,
    ),
    check(
      'order_source_observation_decisions_version_presence',
      sql`(${table.orderVersionBefore} is null) = (${table.fulfillmentVersionBefore} is null) and (${table.orderVersionAfter} is null) = (${table.fulfillmentVersionAfter} is null)`,
    ),
    check(
      'order_source_observation_decisions_versions_positive',
      sql`(${table.orderVersionBefore} is null or ${table.orderVersionBefore} > 0) and (${table.orderVersionAfter} is null or ${table.orderVersionAfter} > 0) and (${table.fulfillmentVersionBefore} is null or ${table.fulfillmentVersionBefore} > 0) and (${table.fulfillmentVersionAfter} is null or ${table.fulfillmentVersionAfter} > 0)`,
    ),
    check(
      'order_source_observation_decisions_versions_monotonic',
      sql`(${table.orderVersionBefore} is null or ${table.orderVersionAfter} >= ${table.orderVersionBefore}) and (${table.fulfillmentVersionBefore} is null or ${table.fulfillmentVersionAfter} >= ${table.fulfillmentVersionBefore})`,
    ),
    check(
      'order_source_observation_decisions_effect_consistent',
      sql`(
        ${table.canonicalEffect} = 'none'
        and (
          (
            ${table.orderVersionBefore} is null
            and ${table.orderVersionAfter} is null
            and ${table.fulfillmentVersionBefore} is null
            and ${table.fulfillmentVersionAfter} is null
          )
          or (
            ${table.orderVersionBefore} is not null
            and ${table.orderVersionAfter} is not null
            and ${table.fulfillmentVersionBefore} is not null
            and ${table.fulfillmentVersionAfter} is not null
            and
            ${table.orderVersionBefore} = ${table.orderVersionAfter}
            and ${table.fulfillmentVersionBefore} = ${table.fulfillmentVersionAfter}
          )
        )
      ) or (
        ${table.canonicalEffect} = 'canonical_created'
        and ${table.orderVersionBefore} is null
        and ${table.orderVersionAfter} is not null
        and ${table.fulfillmentVersionBefore} is null
        and ${table.fulfillmentVersionAfter} is not null
      ) or (
        ${table.canonicalEffect} = 'canonical_updated'
        and ${table.orderVersionBefore} is not null
        and ${table.orderVersionAfter} is not null
        and ${table.fulfillmentVersionBefore} is not null
        and ${table.fulfillmentVersionAfter} is not null
        and (
          ${table.orderVersionAfter} > ${table.orderVersionBefore}
          or ${table.fulfillmentVersionAfter} > ${table.fulfillmentVersionBefore}
        )
      )`,
    ),
    check(
      'order_source_observation_decisions_shadow_has_no_effect',
      sql`${table.evaluationMode} <> 'shadow' or ${table.canonicalEffect} = 'none'`,
    ),
    check(
      'order_source_observation_decisions_nonnewer_has_no_effect',
      sql`${table.revisionClassification} = 'newer' or ${table.canonicalEffect} = 'none'`,
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
