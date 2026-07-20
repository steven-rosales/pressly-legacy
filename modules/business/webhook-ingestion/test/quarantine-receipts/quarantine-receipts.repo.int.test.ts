import { webhookIngestion } from '@pressly/db';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePostgresWebhookIngestionApplication } from '../../src/main.ts';

const runtime = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: ['webhook_receipt_quarantine', 'webhook_events'],
  maxConnections: 2,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

let now = new Date('2026-07-19T14:00:00.000Z');
let nextId = 1;
const id = () =>
  `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
const application = makePostgresWebhookIngestionApplication({
  db: runtime.db,
  clock: { now: () => new Date(now) },
  ids: { next: id },
  quarantineRetentionMs: 1_000,
});

beforeAll(runtime.check);
beforeEach(async () => {
  now = new Date('2026-07-19T14:00:00.000Z');
  nextId = 1;
  await runtime.reset();
});
afterAll(runtime.close);

describe('Postgres webhook receipt quarantine', () => {
  it('deduplicates encrypted receipts, links canonical events, and purges expiry', async () => {
    const command = {
      source: 'cents',
      rawBodySha256: 'a'.repeat(64),
      adapterVersion: 'cents-webhook-v1',
      eventType: 'order_updated',
      payloadCiphertext: 'v1.iv.ciphertext.tag',
      normalization: { outcome: 'accepted' as const },
    };
    const first = await application.captureReceipt(command);
    const duplicate = await application.captureReceipt({
      ...command,
      payloadCiphertext: 'v1.other.randomized.ciphertext',
    });
    expect(first).toMatchObject({ tag: 'ok', value: { duplicate: false } });
    expect(duplicate).toMatchObject({
      tag: 'ok',
      value: {
        receiptId:
          first.tag === 'ok' ? first.value.receiptId : 'unexpected-error',
        duplicate: true,
      },
    });

    const ingested = await application.ingestEvent({
      source: 'cents',
      eventType: 'order_updated',
      deduplicationKey: 'b'.repeat(64),
      subjectType: 'order',
      subjectId: '7486543',
      sourceLocationId: '1308',
      sourceOccurredAt: '2026-07-19T13:33:13.156Z',
      payload: { status: 'SUBMITTED' },
      rawBodySha256: 'a'.repeat(64),
      disposition: 'process',
    });
    if (first.tag === 'err' || ingested.tag === 'err')
      throw new Error('Expected receipt and event persistence.');
    await expect(
      application.linkReceipt({
        receiptId: first.value.receiptId,
        eventId: ingested.value.eventId,
      }),
    ).resolves.toEqual({ tag: 'ok', value: { linked: true } });
    await expect(
      application.linkReceipt({
        receiptId: first.value.receiptId,
        eventId: ingested.value.eventId,
      }),
    ).resolves.toEqual({ tag: 'ok', value: { linked: false } });

    const [stored] = await runtime.db
      .select()
      .from(webhookIngestion.webhookReceiptQuarantine);
    expect(stored).toMatchObject({
      payloadCiphertext: 'v1.iv.ciphertext.tag',
      webhookEventId: ingested.value.eventId,
      normalizationOutcome: 'accepted',
    });

    now = new Date('2026-07-19T14:00:01.001Z');
    await expect(application.purgeExpiredReceipts()).resolves.toEqual({
      tag: 'ok',
      value: { purgedCount: 1 },
    });
    await expect(
      runtime.db.select().from(webhookIngestion.webhookReceiptQuarantine),
    ).resolves.toEqual([]);
  });

  it('stores normalization rejection metadata without a canonical event', async () => {
    await expect(
      application.captureReceipt({
        source: 'cents',
        rawBodySha256: 'c'.repeat(64),
        adapterVersion: 'cents-webhook-v1',
        eventType: null,
        payloadCiphertext: 'v1.iv.rejected.tag',
        normalization: {
          outcome: 'rejected',
          errorCode: 'invalid_cents_order_payload',
        },
      }),
    ).resolves.toMatchObject({ tag: 'ok' });

    const [stored] = await runtime.db
      .select()
      .from(webhookIngestion.webhookReceiptQuarantine);
    expect(stored).toMatchObject({
      webhookEventId: null,
      normalizationOutcome: 'rejected',
      normalizationErrorCode: 'invalid_cents_order_payload',
    });
  });
});
