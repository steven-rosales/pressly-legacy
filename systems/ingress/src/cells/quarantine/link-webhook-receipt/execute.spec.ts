import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, vi } from 'vitest';
import { linkWebhookReceiptCellDeclaration } from './cell.ts';
import { makeExecuteLinkWebhookReceipt } from './execute.ts';

describe('link-webhook-receipt execution', () => {
  proveOperation({
    operationId: 'ingress.link-webhook-receipt.v1',
    declaration: linkWebhookReceiptCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'maps every repository link outcome',
        proves: ['executor-success'],
        run: async () => {
          for (const [stored, kind, outcome] of [
            ['linked', 'success', true],
            ['already_linked', 'success', false],
            ['missing', 'failure', 'webhook_quarantine_receipt_not_found'],
            ['conflict', 'failure', 'webhook_quarantine_link_conflict'],
          ] as const) {
            const execute = makeExecuteLinkWebhookReceipt({
              repo: { link: vi.fn(async () => stored) },
              clock: { now: () => new Date('2026-08-22T16:00:00.000Z') },
            });
            const result = await execute({
              receiptId: '81000000-0000-4000-8000-000000000001',
              eventId: '81000000-0000-4000-8000-000000000002',
            });
            expect(result.kind).toBe(kind);
            expect(
              result.kind === 'success'
                ? result.value.linked
                : result.failure.code,
            ).toBe(outcome);
          }
        },
      },
    ],
  });
});
