import type { PostgresDatabase } from '@pressly/postgres/client';
import { invariantViolationError } from '@pressly/errors/factories';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeIngressRunner, observeIngress } from '../src/public.ts';

const databaseUrl = getTestDatabaseUrl(
  'PRESSLY_INGRESS_CONFORMANCE_DATABASE_URL',
  'postgres://pressly_runtime:pressly_runtime_test@localhost:55434/pressly_test',
);
const resetDatabaseUrl = getTestDatabaseUrl(
  'PRESSLY_INGRESS_CONFORMANCE_DATABASE_RESET_URL',
  'postgres://pressly_migration:pressly_migration_test@localhost:55434/pressly_test',
);
const database = createTestDatabaseRuntime({
  databaseUrl,
  resetDatabaseUrl,
  tableNames: [
    'webhook_receipt_quarantine',
    'webhook_events',
    'source_location_bindings',
  ],
  maxConnections: 8,
});

const uuid = (suffix: number): string =>
  `82000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const now = new Date('2026-08-22T17:00:00.000Z');

const insertEvent = async (
  db: PostgresDatabase,
  input: {
    id: string;
    receivedAt: Date;
  },
): Promise<void> => {
  await db.insert(presslyPostgresOwnerSchemas.ingress.webhookEvents).values({
    id: input.id,
    source: 'cents',
    eventType: 'order_updated',
    dedupeKey: `event-${input.id}`,
    subjectType: 'order',
    subjectId: `order-${input.id}`,
    sourceLocationId: 'store-1',
    sourceOccurredAt: new Date('2026-08-22T16:00:00.000Z'),
    payload: { orderId: input.id },
    payloadHash: 'a'.repeat(64),
    rawBodySha256: 'b'.repeat(64),
    status: 'pending',
    attempts: 0,
    availableAt: input.receivedAt,
    receivedAt: input.receivedAt,
  });
};

const runner = () => {
  let next = 700;
  return makeIngressRunner({
    db: database.db,
    clock: { now: () => new Date(now) },
    ids: { next: () => uuid(++next) },
    quarantineRetentionMs: 1_000,
  });
};

beforeAll(database.check);
beforeEach(database.reset);
afterAll(async () => {
  try {
    await database.reset();
    await expect(observeIngress(database.db)).resolves.toEqual({
      events: [],
      receipts: [],
      bindings: [],
    });
  } finally {
    await database.close();
  }
});

describe('Ingress public integration semantics', () => {
  it('heals the receipt-inbox-link crash window by exact redelivery', async () => {
    const ingress = runner();
    const receipt = {
      source: 'cents',
      rawBodySha256: 'c'.repeat(64),
      adapterVersion: 'cents-webhook-v1',
      eventType: 'order_updated',
      payloadCiphertext: 'opaque.first',
      normalization: { outcome: 'accepted' as const },
    };
    const captured = await ingress.captureReceipt(receipt);
    const command = {
      source: 'cents',
      eventType: 'order_updated',
      deduplicationKey: 'd'.repeat(64),
      subjectType: 'order',
      subjectId: 'order-1',
      sourceLocationId: 'store-1',
      sourceOccurredAt: now,
      payload: { orderId: 'order-1', status: 'SUBMITTED' },
      rawBodySha256: receipt.rawBodySha256,
      disposition: 'process' as const,
    };
    const ingested = await ingress.ingestEvent(command);
    expect(
      await ingress.linkReceipt({
        receiptId: captured.value.receiptId,
        eventId: ingested.value.eventId,
      }),
    ).toMatchObject({ tag: 'ok', value: { linked: true } });

    expect(
      await ingress.captureReceipt({
        ...receipt,
        payloadCiphertext: 'opaque.redelivery',
      }),
    ).toMatchObject({ tag: 'ok', value: { duplicate: true } });
    expect(await ingress.ingestEvent(command)).toMatchObject({
      tag: 'ok',
      value: { duplicate: true },
    });
    const observed = await observeIngress(database.db);
    expect(observed.receipts).toHaveLength(1);
    expect(observed.events).toHaveLength(1);
    expect(observed.receipts[0]).toMatchObject({
      webhookEventId: ingested.value.eventId,
      payloadCiphertext: receipt.payloadCiphertext,
    });
  });

  it('carries lease fences through complete, retry, and dead-letter transitions', async () => {
    await Promise.all(
      [uuid(10), uuid(11), uuid(12)].map((id, index) =>
        insertEvent(database.db, {
          id,
          receivedAt: new Date(now.getTime() - (3 - index) * 1_000),
        }),
      ),
    );
    const ingress = runner();
    const claims = await ingress.claimEvents({
      workerId: 'worker-1',
      leaseMs: 30_000,
      limit: 3,
    });
    expect(claims).toHaveLength(3);
    const [completeClaim, retryClaim, deadClaim] = claims;
    if (
      completeClaim === undefined ||
      retryClaim === undefined ||
      deadClaim === undefined
    )
      throw invariantViolationError({
        code: 'ingress_conformance_claim_missing',
        message: 'Expected three claimed webhook events.',
      });
    expect(await ingress.completeEvent(completeClaim)).toBe('applied');
    expect(
      await ingress.retryEvent({
        ...retryClaim,
        availableAt: new Date(now.getTime() + 60_000),
        code: 'projection_pending',
        message: 'retry later',
      }),
    ).toBe('applied');
    expect(
      await ingress.deadLetterEvent({
        ...deadClaim,
        code: 'terminal',
        message: 'terminal failure',
      }),
    ).toBe('applied');
    expect(await ingress.completeEvent(completeClaim)).toBe('lease_lost');
    expect((await observeIngress(database.db)).events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: completeClaim.eventId,
          status: 'processed',
        }),
        expect.objectContaining({ id: retryClaim.eventId, status: 'pending' }),
        expect.objectContaining({ id: deadClaim.eventId, status: 'dead' }),
      ]),
    );
  });

  it('integrates add-only reconciliation with exact active lookup', async () => {
    const ingress = runner();
    const binding = {
      source: 'cents',
      externalLocationId: 'store-1',
      locationId: 'location-1',
      isActive: true,
    } as const;
    expect(
      await ingress.reconcileSourceLocationBindings({
        manifest: { sourceLocationBindings: [binding] },
        dryRun: false,
      }),
    ).toMatchObject({
      tag: 'ok',
      value: { applied: true, status: 'converged' },
    });
    await expect(
      ingress.resolveSourceLocation({
        source: 'cents',
        externalLocationId: 'store-1',
      }),
    ).resolves.toBe('location-1');
    expect(
      await ingress.reconcileSourceLocationBindings({
        manifest: {
          sourceLocationBindings: [{ ...binding, locationId: 'location-2' }],
        },
        dryRun: false,
      }),
    ).toMatchObject({
      tag: 'ok',
      value: {
        applied: false,
        status: 'rejected',
        rejections: [{ code: 'binding_location_change' }],
      },
    });
    await expect(
      ingress.resolveSourceLocation({
        source: 'cents',
        externalLocationId: 'store-1',
      }),
    ).resolves.toBe('location-1');
  });
});
