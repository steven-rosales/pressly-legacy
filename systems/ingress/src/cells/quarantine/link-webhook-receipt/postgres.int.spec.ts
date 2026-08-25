import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  ingressPostgresUuid,
  installIngressPostgresFixture,
} from '../../../testing/postgres-fixture.ts';
import { linkWebhookReceiptCellDeclaration } from './cell.ts';

const fixture = installIngressPostgresFixture();
const receiptId = ingressPostgresUuid(200);
const eventId = ingressPostgresUuid(201);
const otherEventId = ingressPostgresUuid(202);

const seed = async () => {
  await fixture.insertEvent({ id: eventId });
  await fixture.insertEvent({ id: otherEventId });
  await fixture.insertReceipt({ id: receiptId });
};

proveOperation({
  operationId: 'ingress.link-webhook-receipt.v1',
  declaration: linkWebhookReceiptCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits and replays one exact receipt link',
      proves: [
        'contract',
        'executor-success',
        'postgres-commit',
        'same-payload-replay',
      ],
      run: async () => {
        expect(linkWebhookReceiptCellDeclaration).toMatchObject({
          id: 'ingress.link-webhook-receipt.v1',
          consistency: { transaction: 'required', concurrency: 'partitioned' },
          emits: [],
        });
        await seed();
        const cell = fixture.makeSystem().cells.linkWebhookReceipt;
        expect(await cell.execute({ receiptId, eventId })).toEqual({
          kind: 'success',
          value: { linked: true },
        });
        expect(await cell.execute({ receiptId, eventId })).toEqual({
          kind: 'success',
          value: { linked: false },
        });
        const [stored] = await fixture.db
          .select()
          .from(fixture.schema.webhookReceiptQuarantine)
          .where(eq(fixture.schema.webhookReceiptQuarantine.id, receiptId));
        expect(stored).toMatchObject({
          webhookEventId: eventId,
          linkedAt: fixture.now(),
        });
      },
    },

    {
      name: 'returns typed missing and divergent link decisions without mutation',
      proves: [
        'decision',
        'divergent-key-conflict',
        'expected-rejection-no-partial-write',
      ],
      run: async () => {
        await seed();
        const cell = fixture.makeSystem().cells.linkWebhookReceipt;
        await expect(
          cell.execute({ receiptId: ingressPostgresUuid(999), eventId }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'webhook_quarantine_receipt_not_found' },
        });
        await cell.execute({ receiptId, eventId });
        await expect(
          cell.execute({ receiptId, eventId: otherEventId }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'webhook_quarantine_link_conflict' },
        });
        const [stored] = await fixture.db
          .select({
            eventId: fixture.schema.webhookReceiptQuarantine.webhookEventId,
          })
          .from(fixture.schema.webhookReceiptQuarantine)
          .where(eq(fixture.schema.webhookReceiptQuarantine.id, receiptId));
        expect(stored).toEqual({ eventId });
      },
    },

    {
      name: 'serializes a divergent receipt-link race',
      proves: ['declared-concurrency-race'],
      run: async () => {
        await seed();
        const cell = fixture.makeSystem().cells.linkWebhookReceipt;
        const results = await Promise.all([
          cell.execute({ receiptId, eventId }),
          cell.execute({ receiptId, eventId: otherEventId }),
        ]);
        expect(
          results.filter((result) => result.kind === 'success'),
        ).toHaveLength(1);
        expect(
          results.filter((result) => result.kind === 'failure'),
        ).toHaveLength(1);
        const [stored] = await fixture.db
          .select({
            eventId: fixture.schema.webhookReceiptQuarantine.webhookEventId,
          })
          .from(fixture.schema.webhookReceiptQuarantine);
        expect([eventId, otherEventId]).toContain(stored?.eventId);
      },
    },

    {
      name: 'rolls back an unavailable receipt link',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await seed();
        const cell = fixture.makeSystem().cells.linkWebhookReceipt;
        await expect(
          fixture.withUnavailableTable('webhook_receipt_quarantine', () =>
            cell.execute({ receiptId, eventId }),
          ),
        ).rejects.toMatchObject({
          kind: 'DatabaseError',
          code: 'webhook_quarantine_link_failed',
        });
        const [stored] = await fixture.db
          .select()
          .from(fixture.schema.webhookReceiptQuarantine);
        expect(stored).toMatchObject({ webhookEventId: null, linkedAt: null });
      },
    },
  ],
});
