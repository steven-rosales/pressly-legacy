import type { PostgresDatabase } from '@pressly/postgres/client';
import { createPostgresRuntime } from '@pressly/postgres/client';
import { sql } from '@pressly/postgres/query';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, expect } from 'vitest';
import { makeIngressStateSystem, type IngressStateSystem } from '../system.ts';
import type { CentsWebhookPayloadCipher } from '../sources/cents/public.ts';
import { ingressTestSchema } from './schema.ts';

const databaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_URL',
  'postgres://pressly_runtime:pressly_runtime_test@localhost:55434/pressly_test',
);
const resetDatabaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_RESET_URL',
  'postgres://pressly_migration:pressly_migration_test@localhost:55434/pressly_test',
);

const tableNames = [
  'webhook_receipt_quarantine',
  'webhook_events',
  'source_location_bindings',
] as const;

export const ingressPostgresNow = new Date('2026-08-22T16:00:00.000Z');

export const ingressPostgresUuid = (suffix: number): string =>
  `81000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export type IngressPostgresFixture = Readonly<{
  db: PostgresDatabase;
  schema: typeof ingressTestSchema;
  now: () => Date;
  setNow: (value: Date) => void;
  makeSystem: (input?: {
    quarantineRetentionMs?: number;
    payloadCipher?: CentsWebhookPayloadCipher;
  }) => IngressStateSystem;
  insertEvent: (input: {
    id: string;
    source?: string;
    dedupeKey?: string;
    rawBodySha256?: string;
    status?: 'pending' | 'processing' | 'processed' | 'dead';
    attempts?: number;
    availableAt?: Date;
    receivedAt?: Date;
    leaseOwner?: string | null;
    leaseExpiresAt?: Date | null;
    payload?: unknown;
    payloadHash?: string | null;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    processedAt?: Date | null;
  }) => Promise<void>;
  insertReceipt: (input: {
    id: string;
    source?: string;
    rawBodySha256?: string;
    adapterVersion?: string;
    eventType?: string | null;
    normalizationOutcome?: 'accepted' | 'rejected';
    normalizationErrorCode?: string | null;
    payloadCiphertext?: string;
    webhookEventId?: string | null;
    receivedAt?: Date;
    expiresAt?: Date;
    linkedAt?: Date | null;
  }) => Promise<void>;
  insertBinding: (input: {
    source: string;
    externalLocationId: string;
    locationId?: string;
    isActive?: boolean;
  }) => Promise<void>;
  withUnavailableTable: <Value>(
    table:
      | 'source_location_bindings'
      | 'webhook_events'
      | 'webhook_receipt_quarantine',
    action: () => Promise<Value>,
  ) => Promise<Value>;
  readCounts: () => Promise<{
    bindings: number;
    events: number;
    receipts: number;
  }>;
}>;

export const installIngressPostgresFixture = (): IngressPostgresFixture => {
  const runtime = createTestDatabaseRuntime({
    databaseUrl,
    resetDatabaseUrl,
    tableNames,
    maxConnections: 8,
  });
  const faultRuntime = createPostgresRuntime({
    databaseUrl: resetDatabaseUrl,
    schema: {},
    maxConnections: 1,
  });
  let currentNow = new Date(ingressPostgresNow);
  let nextId = 700;

  const readCounts = async () => {
    const [events, receipts, bindings] = await Promise.all([
      runtime.db
        .select({ id: ingressTestSchema.webhookEvents.id })
        .from(ingressTestSchema.webhookEvents),
      runtime.db
        .select({ id: ingressTestSchema.webhookReceiptQuarantine.id })
        .from(ingressTestSchema.webhookReceiptQuarantine),
      runtime.db
        .select({ source: ingressTestSchema.sourceLocationBindings.source })
        .from(ingressTestSchema.sourceLocationBindings),
    ]);
    return {
      events: events.length,
      receipts: receipts.length,
      bindings: bindings.length,
    };
  };

  beforeAll(async () => {
    await Promise.all([runtime.check(), faultRuntime.check()]);
  });
  beforeEach(async () => {
    currentNow = new Date(ingressPostgresNow);
    nextId = 700;
    await runtime.reset();
  });
  afterAll(async () => {
    try {
      await runtime.reset();
      expect(await readCounts()).toEqual({
        bindings: 0,
        events: 0,
        receipts: 0,
      });
    } finally {
      await Promise.all([runtime.close(), faultRuntime.close()]);
    }
  });

  return Object.freeze({
    db: runtime.db,
    schema: ingressTestSchema,
    now: () => new Date(currentNow),
    setNow: (value) => {
      currentNow = new Date(value);
    },
    makeSystem: (input = {}) =>
      makeIngressStateSystem({
        db: runtime.db,
        schema: ingressTestSchema,
        clock: { now: () => new Date(currentNow) },
        ids: { next: () => ingressPostgresUuid(++nextId) },
        quarantineRetentionMs: input.quarantineRetentionMs ?? 1_000,
        ...(input.payloadCipher === undefined
          ? {}
          : { cents: { payloadCipher: input.payloadCipher } }),
      }),
    insertEvent: async (input) => {
      await runtime.db.insert(ingressTestSchema.webhookEvents).values({
        id: input.id,
        source: input.source ?? 'cents',
        eventType: 'order_updated',
        dedupeKey: input.dedupeKey ?? `event-${input.id}`,
        subjectType: 'order',
        subjectId: `order-${input.id}`,
        sourceLocationId: 'store-1',
        sourceOccurredAt: new Date('2026-08-22T15:00:00.000Z'),
        payload:
          input.payload === undefined ? { orderId: input.id } : input.payload,
        payloadHash:
          input.payloadHash === undefined ? 'a'.repeat(64) : input.payloadHash,
        rawBodySha256: input.rawBodySha256 ?? 'b'.repeat(64),
        status: input.status ?? 'pending',
        attempts: input.attempts ?? 0,
        availableAt: input.availableAt ?? new Date('2026-08-22T15:00:00.000Z'),
        receivedAt: input.receivedAt ?? new Date('2026-08-22T15:00:00.000Z'),
        leaseOwner: input.leaseOwner ?? null,
        leaseExpiresAt: input.leaseExpiresAt ?? null,
        lastErrorCode: input.lastErrorCode ?? null,
        lastErrorMessage: input.lastErrorMessage ?? null,
        processedAt: input.processedAt ?? null,
      });
    },
    insertReceipt: async (input) => {
      const outcome = input.normalizationOutcome ?? 'accepted';
      await runtime.db
        .insert(ingressTestSchema.webhookReceiptQuarantine)
        .values({
          id: input.id,
          source: input.source ?? 'cents',
          rawBodySha256: input.rawBodySha256 ?? 'c'.repeat(64),
          adapterVersion: input.adapterVersion ?? 'cents-webhook-v1',
          eventType:
            input.eventType === undefined ? 'order_updated' : input.eventType,
          normalizationOutcome: outcome,
          normalizationErrorCode:
            input.normalizationErrorCode === undefined
              ? outcome === 'rejected'
                ? 'invalid_payload'
                : null
              : input.normalizationErrorCode,
          payloadCiphertext: input.payloadCiphertext ?? 'opaque.ciphertext',
          webhookEventId: input.webhookEventId ?? null,
          receivedAt: input.receivedAt ?? currentNow,
          expiresAt: input.expiresAt ?? new Date(currentNow.getTime() + 1_000),
          linkedAt: input.linkedAt ?? null,
        });
    },
    insertBinding: async (input) => {
      await runtime.db.insert(ingressTestSchema.sourceLocationBindings).values({
        source: input.source,
        externalLocationId: input.externalLocationId,
        locationId: input.locationId ?? 'location-1',
        isActive: input.isActive ?? true,
        createdAt: currentNow,
        updatedAt: currentNow,
      });
    },
    withUnavailableTable: async (table, action) => {
      if (table === 'webhook_events')
        await faultRuntime.db.execute(
          sql`alter table webhook_events rename to webhook_events_ingress_cell_test_unavailable`,
        );
      else if (table === 'webhook_receipt_quarantine')
        await faultRuntime.db.execute(
          sql`alter table webhook_receipt_quarantine rename to webhook_receipt_quarantine_ingress_cell_test_unavailable`,
        );
      else
        await faultRuntime.db.execute(
          sql`alter table source_location_bindings rename to source_location_bindings_ingress_cell_test_unavailable`,
        );
      try {
        return await action();
      } finally {
        if (table === 'webhook_events')
          await faultRuntime.db.execute(
            sql`alter table webhook_events_ingress_cell_test_unavailable rename to webhook_events`,
          );
        else if (table === 'webhook_receipt_quarantine')
          await faultRuntime.db.execute(
            sql`alter table webhook_receipt_quarantine_ingress_cell_test_unavailable rename to webhook_receipt_quarantine`,
          );
        else
          await faultRuntime.db.execute(
            sql`alter table source_location_bindings_ingress_cell_test_unavailable rename to source_location_bindings`,
          );
      }
    },
    readCounts,
  });
};
