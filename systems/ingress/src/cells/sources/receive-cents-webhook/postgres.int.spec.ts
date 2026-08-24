import { encodeBase64Bytes } from '@pressly/codec';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { installIngressPostgresFixture } from '../../../testing/postgres-fixture.ts';
import { makeCentsWebhookPayloadCipher } from '../../../sources/cents/public.ts';
import { receiveCentsWebhookCellDeclaration } from './cell.ts';

const fixture = installIngressPostgresFixture();
const payloadCipher = makeCentsWebhookPayloadCipher(
  Buffer.alloc(32, 7).toString('base64'),
);
const validOrder = {
  action: 'order_updated',
  order: {
    id: 12345,
    storeId: 24,
    orderCode: '00123',
    status: 'SUBMITTED',
    orderTotal: 29.99,
    balanceDue: 24.99,
    dueDate: '2026-07-12T21:00:00.000Z',
    updatedAt: '2026-07-12T15:59:00.000Z',
  },
  services: [
    {
      id: 43,
      name: 'Wash and Fold',
      quantity: 10,
      totalPrice: 29.99,
      unitCost: 2,
      serviceCategory: 'Wash and Fold',
      serviceCategoryType: 'LAUNDRY',
    },
  ],
  customer: {
    id: 815,
    firstName: 'Private',
    lastName: 'Customer',
    email: 'private@example.invalid',
    phoneNumber: '+15550000001',
  },
} as const;

const command = (body: string) => ({
  rawBodyBase64: encodeBase64Bytes(new TextEncoder().encode(body)),
});
const validCommand = command(JSON.stringify(validOrder));

proveOperation({
  operationId: 'ingress.receive-cents-webhook.v1',
  declaration: receiveCentsWebhookCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits protocol input through capture ingest and link',
      proves: ['contract', 'executor-success', 'protocol', 'postgres-commit'],
      run: async () => {
        expect(receiveCentsWebhookCellDeclaration).toMatchObject({
          id: 'ingress.receive-cents-webhook.v1',
          consistency: { transaction: 'none', concurrency: 'none' },
          idempotency: { required: false },
          emits: [],
        });
        const result = await fixture
          .makeSystem({ payloadCipher })
          .cells.receiveCentsWebhook.execute(validCommand);
        expect(result).toMatchObject({
          kind: 'success',
          value: { duplicate: false, status: 'pending' },
        });
        const [receipts, events] = await Promise.all([
          fixture.db.select().from(fixture.schema.webhookReceiptQuarantine),
          fixture.db.select().from(fixture.schema.webhookEvents),
        ]);
        expect(receipts).toHaveLength(1);
        expect(events).toHaveLength(1);
        expect(receipts[0]).toMatchObject({
          normalizationOutcome: 'accepted',
          webhookEventId: events[0]?.id,
          linkedAt: fixture.now(),
        });
        expect(receipts[0]?.payloadCiphertext).not.toContain(
          'private@example.invalid',
        );
      },
    },

    {
      name: 'rejects malformed input without a partial business inbox write',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const result = await fixture
          .makeSystem({ payloadCipher })
          .cells.receiveCentsWebhook.execute(command('{"broken"'));
        expect(result).toMatchObject({
          kind: 'failure',
          failure: { code: 'invalid_cents_webhook_body' },
        });
        const [receipts, events] = await Promise.all([
          fixture.db.select().from(fixture.schema.webhookReceiptQuarantine),
          fixture.db.select().from(fixture.schema.webhookEvents),
        ]);
        expect(events).toEqual([]);
        expect(receipts).toEqual([
          expect.objectContaining({
            normalizationOutcome: 'rejected',
            normalizationErrorCode: 'invalid_cents_webhook_body',
            webhookEventId: null,
          }),
        ]);
      },
    },

    {
      name: 'heals exact replay to one receipt event and link',
      proves: ['same-payload-replay'],
      run: async () => {
        const cell = fixture.makeSystem({ payloadCipher }).cells
          .receiveCentsWebhook;
        const first = await cell.execute(validCommand);
        const replay = await cell.execute(validCommand);
        expect(first).toMatchObject({
          kind: 'success',
          value: { duplicate: false },
        });
        expect(replay).toMatchObject({
          kind: 'success',
          value: { duplicate: true },
        });
        expect(await fixture.readCounts()).toEqual({
          bindings: 0,
          events: 1,
          receipts: 1,
        });
        const [receipt] = await fixture.db
          .select()
          .from(fixture.schema.webhookReceiptQuarantine);
        expect(receipt?.webhookEventId).not.toBeNull();
      },
    },

    {
      name: 'preserves the explicit capture crash window for redelivery healing',
      proves: ['postgres-commit', 'same-payload-replay'],
      run: async () => {
        const cell = fixture.makeSystem({ payloadCipher }).cells
          .receiveCentsWebhook;
        await expect(
          fixture.withUnavailableTable('webhook_events', () =>
            cell.execute(validCommand),
          ),
        ).rejects.toMatchObject({
          kind: 'DatabaseError',
          code: 'webhook_event_ingestion_failed',
        });
        const [unlinked] = await fixture.db
          .select()
          .from(fixture.schema.webhookReceiptQuarantine);
        expect(unlinked).toMatchObject({
          webhookEventId: null,
          linkedAt: null,
        });

        expect(await cell.execute(validCommand)).toMatchObject({
          kind: 'success',
          value: { duplicate: false, status: 'pending' },
        });
        expect(await fixture.readCounts()).toEqual({
          bindings: 0,
          events: 1,
          receipts: 1,
        });
        const [healed] = await fixture.db
          .select()
          .from(fixture.schema.webhookReceiptQuarantine);
        expect(healed?.webhookEventId).not.toBeNull();
      },
    },

    {
      name: 'serializes concurrent exact deliveries through owner keys',
      proves: ['same-key-concurrency'],
      run: async () => {
        const cell = fixture.makeSystem({ payloadCipher }).cells
          .receiveCentsWebhook;
        const results = await Promise.all([
          cell.execute(validCommand),
          cell.execute(validCommand),
        ]);
        expect(
          results.map((result) =>
            result.kind === 'success' ? result.value.duplicate : 'failure',
          ),
        ).toEqual(expect.arrayContaining([false, true]));
        expect(await fixture.readCounts()).toEqual({
          bindings: 0,
          events: 1,
          receipts: 1,
        });
      },
    },
  ],
});
