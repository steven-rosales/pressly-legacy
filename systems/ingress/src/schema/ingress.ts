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

export const makeIngressSchema = () => {
  const timestamps = {
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  };

  const webhookEvents = pgTable(
    'webhook_events',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      source: text('source').notNull(),
      eventType: text('event_type').notNull(),
      dedupeKey: text('dedupe_key').notNull(),
      subjectType: text('subject_type').notNull(),
      subjectId: text('subject_id'),
      sourceLocationId: text('source_location_id'),
      sourceOccurredAt: timestamp('source_occurred_at', { withTimezone: true }),
      payload: jsonb('payload_json'),
      payloadHash: text('payload_hash'),
      rawBodySha256: text('raw_body_sha256').notNull(),
      status: text('status').notNull().default('pending'),
      attempts: integer('attempts').notNull().default(0),
      availableAt: timestamp('available_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
      leaseOwner: text('lease_owner'),
      leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
      lastErrorCode: text('last_error_code'),
      lastErrorMessage: text('last_error_message'),
      receivedAt: timestamp('received_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
      processedAt: timestamp('processed_at', { withTimezone: true }),
    },
    (table) => [
      uniqueIndex('webhook_events_dedupe_unique').on(
        table.source,
        table.dedupeKey,
      ),
      index('webhook_events_claimable_idx').on(
        table.status,
        table.availableAt,
        table.leaseExpiresAt,
      ),
      check('webhook_events_attempts_nonnegative', sql`${table.attempts} >= 0`),
      check(
        'webhook_events_known_status',
        sql`${table.status} in ('pending', 'processing', 'processed', 'dead')`,
      ),
    ],
  );

  const webhookReceiptQuarantine = pgTable(
    'webhook_receipt_quarantine',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      source: text('source').notNull(),
      rawBodySha256: text('raw_body_sha256').notNull(),
      adapterVersion: text('adapter_version').notNull(),
      eventType: text('event_type'),
      normalizationOutcome: text('normalization_outcome').notNull(),
      normalizationErrorCode: text('normalization_error_code'),
      payloadCiphertext: text('payload_ciphertext').notNull(),
      webhookEventId: uuid('webhook_event_id').references(
        () => webhookEvents.id,
      ),
      receivedAt: timestamp('received_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
      expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
      linkedAt: timestamp('linked_at', { withTimezone: true }),
    },
    (table) => [
      uniqueIndex('webhook_receipt_quarantine_body_version_unique').on(
        table.source,
        table.rawBodySha256,
        table.adapterVersion,
      ),
      index('webhook_receipt_quarantine_expiry_idx').on(table.expiresAt),
      index('webhook_receipt_quarantine_event_idx').on(table.webhookEventId),
      check(
        'webhook_receipt_quarantine_outcome_valid',
        sql`${table.normalizationOutcome} in ('accepted', 'rejected')`,
      ),
      check(
        'webhook_receipt_quarantine_error_consistent',
        sql`(${table.normalizationOutcome} = 'accepted' and ${table.normalizationErrorCode} is null) or (${table.normalizationOutcome} = 'rejected' and ${table.normalizationErrorCode} is not null)`,
      ),
      check(
        'webhook_receipt_quarantine_link_consistent',
        sql`(${table.webhookEventId} is null and ${table.linkedAt} is null) or (${table.webhookEventId} is not null and ${table.linkedAt} is not null)`,
      ),
    ],
  );

  const sourceLocationBindings = pgTable(
    'source_location_bindings',
    {
      source: text('source').notNull(),
      externalLocationId: text('external_location_id').notNull(),
      locationId: text('location_id').notNull(),
      isActive: boolean('is_active').notNull().default(true),
      ...timestamps,
    },
    (table) => [
      primaryKey({ columns: [table.source, table.externalLocationId] }),
      index('source_location_bindings_location_idx').on(table.locationId),
    ],
  );

  return Object.freeze({
    webhookEvents,
    webhookReceiptQuarantine,
    sourceLocationBindings,
  });
};

export type IngressSchema = ReturnType<typeof makeIngressSchema>;
