import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  ingressPostgresUuid,
  installIngressPostgresFixture,
} from '../../../testing/postgres-fixture.ts';
import { captureWebhookReceiptCellDeclaration } from './cell.ts';

const fixture = installIngressPostgresFixture();
const receipt = {
  source: 'cents',
  rawBodySha256: 'a'.repeat(64),
  adapterVersion: 'cents-webhook-v1',
  eventType: 'order_updated',
  payloadCiphertext: 'v1.first.randomized.ciphertext',
  normalization: { outcome: 'accepted' as const },
};

proveOperation({
  operationId: 'ingress.capture-webhook-receipt.v1',
  declaration: captureWebhookReceiptCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits one exact quarantined receipt',
      proves: ['contract', 'executor-success', 'postgres-commit'],
      run: async () => {
        expect(captureWebhookReceiptCellDeclaration).toMatchObject({
          id: 'ingress.capture-webhook-receipt.v1',
          consistency: { transaction: 'required', concurrency: 'partitioned' },
          idempotency: { required: true },
          emits: [],
        });
        const result = await fixture
          .makeSystem()
          .cells.captureWebhookReceipt.execute(receipt);
        expect(result).toMatchObject({
          kind: 'success',
          value: { duplicate: false },
        });
        const rows = await fixture.db
          .select()
          .from(fixture.schema.webhookReceiptQuarantine);
        expect(rows).toEqual([
          expect.objectContaining({
            source: 'cents',
            rawBodySha256: receipt.rawBodySha256,
            payloadCiphertext: receipt.payloadCiphertext,
            normalizationOutcome: 'accepted',
            webhookEventId: null,
          }),
        ]);
      },
    },

    {
      name: 'replays identical payload and rejects divergent metadata',
      proves: [
        'same-payload-replay',
        'divergent-key-conflict',
        'expected-rejection-no-partial-write',
      ],
      run: async () => {
        const cell = fixture.makeSystem().cells.captureWebhookReceipt;
        const first = await cell.execute(receipt);
        const replay = await cell.execute({
          ...receipt,
          payloadCiphertext: 'v1.second.randomized.ciphertext',
        });
        await expect(
          cell.execute({ ...receipt, eventType: 'different_event' }),
        ).rejects.toMatchObject({
          code: 'webhook_quarantine_duplicate_diverged',
        });
        expect(replay).toMatchObject({
          kind: 'success',
          value: {
            receiptId:
              first.kind === 'success' ? first.value.receiptId : undefined,
            duplicate: true,
          },
        });
        const rows = await fixture.db
          .select()
          .from(fixture.schema.webhookReceiptQuarantine);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          eventType: receipt.eventType,
          payloadCiphertext: receipt.payloadCiphertext,
        });
      },
    },

    {
      name: 'serializes a same-key receipt race',
      proves: ['same-key-concurrency', 'declared-concurrency-race'],
      run: async () => {
        const cell = fixture.makeSystem().cells.captureWebhookReceipt;
        const results = await Promise.all([
          cell.execute(receipt),
          cell.execute(receipt),
        ]);
        expect(
          results.map((result) =>
            result.kind === 'success' ? result.value.duplicate : 'failure',
          ),
        ).toEqual(expect.arrayContaining([false, true]));
        expect(
          await fixture.db
            .select({ id: fixture.schema.webhookReceiptQuarantine.id })
            .from(fixture.schema.webhookReceiptQuarantine),
        ).toHaveLength(1);
      },
    },

    {
      name: 'rolls back when receipt persistence is unavailable',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        const cell = fixture.makeSystem().cells.captureWebhookReceipt;
        await expect(
          fixture.withUnavailableTable('webhook_receipt_quarantine', () =>
            cell.execute(receipt),
          ),
        ).rejects.toMatchObject({
          kind: 'DatabaseError',
          code: 'webhook_quarantine_capture_failed',
        });
        expect(
          await fixture.db
            .select({ id: fixture.schema.webhookReceiptQuarantine.id })
            .from(fixture.schema.webhookReceiptQuarantine)
            .where(
              eq(
                fixture.schema.webhookReceiptQuarantine.id,
                ingressPostgresUuid(701),
              ),
            ),
        ).toEqual([]);
      },
    },
  ],
});
