import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  ingressPostgresUuid,
  installIngressPostgresFixture,
} from '../../../testing/postgres-fixture.ts';
import { purgeExpiredWebhookReceiptsCellDeclaration } from './cell.ts';

const fixture = installIngressPostgresFixture();

proveOperation({
  operationId: 'ingress.purge-expired-webhook-receipts.v1',
  declaration: purgeExpiredWebhookReceiptsCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits the exact expiry boundary and retains future receipts',
      proves: [
        'contract',
        'executor-success',
        'postgres-commit',
        'expected-rejection-no-partial-write',
        'same-payload-replay',
      ],
      run: async () => {
        expect(purgeExpiredWebhookReceiptsCellDeclaration).toMatchObject({
          id: 'ingress.purge-expired-webhook-receipts.v1',
          consistency: { transaction: 'required', concurrency: 'none' },
          emits: [],
        });
        await fixture.insertReceipt({
          id: ingressPostgresUuid(300),
          rawBodySha256: 'a'.repeat(64),
          expiresAt: fixture.now(),
        });
        await fixture.insertReceipt({
          id: ingressPostgresUuid(301),
          rawBodySha256: 'b'.repeat(64),
          expiresAt: new Date(fixture.now().getTime() + 1),
        });
        const cell = fixture.makeSystem().cells.purgeExpiredWebhookReceipts;
        expect(await cell.execute({})).toEqual({
          kind: 'success',
          value: { purgedCount: 1 },
        });
        expect(await cell.execute({})).toEqual({
          kind: 'success',
          value: { purgedCount: 0 },
        });
        const rows = await fixture.db
          .select({ id: fixture.schema.webhookReceiptQuarantine.id })
          .from(fixture.schema.webhookReceiptQuarantine);
        expect(rows).toEqual([{ id: ingressPostgresUuid(301) }]);
      },
    },

    {
      name: 'makes concurrent purge attempts delete each row once',
      proves: ['same-key-concurrency'],
      run: async () => {
        await fixture.insertReceipt({
          id: ingressPostgresUuid(310),
          rawBodySha256: 'c'.repeat(64),
          expiresAt: fixture.now(),
        });
        await fixture.insertReceipt({
          id: ingressPostgresUuid(311),
          rawBodySha256: 'd'.repeat(64),
          expiresAt: fixture.now(),
        });
        const cell = fixture.makeSystem().cells.purgeExpiredWebhookReceipts;
        const outcomes = await Promise.all([
          cell.execute({}),
          cell.execute({}),
        ]);
        expect(
          outcomes.reduce(
            (total, outcome) =>
              total +
              (outcome.kind === 'success' ? outcome.value.purgedCount : 0),
            0,
          ),
        ).toBe(2);
        expect(
          await fixture.db
            .select()
            .from(fixture.schema.webhookReceiptQuarantine),
        ).toEqual([]);
      },
    },

    {
      name: 'rolls back an unavailable purge',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await fixture.insertReceipt({
          id: ingressPostgresUuid(320),
          expiresAt: fixture.now(),
        });
        const cell = fixture.makeSystem().cells.purgeExpiredWebhookReceipts;
        await expect(
          fixture.withUnavailableTable('webhook_receipt_quarantine', () =>
            cell.execute({}),
          ),
        ).rejects.toMatchObject({
          kind: 'DatabaseError',
          code: 'webhook_quarantine_purge_failed',
        });
        expect(
          await fixture.db
            .select()
            .from(fixture.schema.webhookReceiptQuarantine),
        ).toHaveLength(1);
      },
    },
  ],
});
