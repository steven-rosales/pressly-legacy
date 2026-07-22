import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    version: integer('version').notNull().default(1),
    firstName: text('first_name'),
    lastName: text('last_name'),
    businessName: text('business_name'),
    phone: text('phone'),
    email: text('email'),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    check('users_positive_version', sql`${table.version} > 0`),
    index('users_phone_idx').on(table.phone),
    index('users_email_idx').on(table.email),
  ],
);

export const userSourceLinks = pgTable(
  'user_source_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    externalUserId: text('external_user_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('user_source_links_source_identity_unique').on(
      table.source,
      table.externalUserId,
    ),
    index('user_source_links_user_idx').on(table.userId),
  ],
);

export const userSourceSnapshots = pgTable(
  'user_source_snapshots',
  {
    sourceLinkId: uuid('source_link_id')
      .primaryKey()
      .references(() => userSourceLinks.id, { onDelete: 'cascade' }),
    sourceRevisionAt: timestamp('source_revision_at', {
      withTimezone: true,
    }).notNull(),
    sourceRevisionHash: text('source_revision_hash').notNull(),
    adapterVersion: text('adapter_version').notNull(),
    normalizedPayload: jsonb('normalized_payload_json').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      'user_source_snapshots_hash_shape',
      sql`${table.sourceRevisionHash} ~ '^[a-f0-9]{64}$'`,
    ),
    index('user_source_snapshots_revision_idx').on(table.sourceRevisionAt),
  ],
);

export const userFieldAuthorities = pgTable(
  'user_field_authorities',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fieldName: text('field_name').notNull(),
    authority: text('authority').notNull(),
    source: text('source'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.fieldName] }),
    check(
      'user_field_authorities_valid',
      sql`(${table.authority} = 'pressly' and ${table.source} is null) or (${table.authority} = 'source' and ${table.source} is not null)`,
    ),
  ],
);

export const userConsents = pgTable(
  'user_consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    consentKind: text('consent_kind').notNull(),
    granted: boolean('granted').notNull(),
    source: text('source').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    sourcePayloadHash: text('source_payload_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('user_consents_idempotency_unique').on(table.idempotencyKey),
    index('user_consents_user_observed_idx').on(table.userId, table.observedAt),
    check(
      'user_consents_hash_shape',
      sql`${table.sourcePayloadHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const userDuplicateCandidates = pgTable(
  'user_duplicate_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    candidateUserId: uuid('candidate_user_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('open'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('user_duplicate_candidates_pair_reason_unique').on(
      table.userId,
      table.candidateUserId,
      table.reason,
    ),
    check(
      'user_duplicate_candidates_distinct_users',
      sql`${table.userId} <> ${table.candidateUserId}`,
    ),
    check(
      'user_duplicate_candidates_status_valid',
      sql`${table.status} in ('open', 'dismissed', 'merged')`,
    ),
    check(
      'user_duplicate_candidates_resolution_consistent',
      sql`(${table.status} = 'open' and ${table.resolvedAt} is null) or (${table.status} <> 'open' and ${table.resolvedAt} is not null)`,
    ),
  ],
);

export const userCommandReceipts = pgTable(
  'user_command_receipts',
  {
    idempotencyKey: text('idempotency_key').primaryKey(),
    commandHash: text('command_hash').notNull(),
    origin: text('origin').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    result: jsonb('result_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'user_command_receipts_actor_kind_valid',
      sql`${table.actorKind} in ('human', 'service', 'system')`,
    ),
    check(
      'user_command_receipts_context_present',
      sql`length(trim(${table.origin})) > 0 and length(trim(${table.actorId})) > 0`,
    ),
  ],
);
