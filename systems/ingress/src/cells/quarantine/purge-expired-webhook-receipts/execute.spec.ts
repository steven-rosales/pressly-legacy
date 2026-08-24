import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, vi } from 'vitest';
import { purgeExpiredWebhookReceiptsCellDeclaration } from './cell.ts';
import { makeExecutePurgeExpiredWebhookReceipts } from './execute.ts';

describe('purge-expired-webhook-receipts execution', () => {
  proveOperation({
    operationId: 'ingress.purge-expired-webhook-receipts.v1',
    declaration: purgeExpiredWebhookReceiptsCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'purges only through the current retention boundary',
        proves: ['executor-success'],
        run: async () => {
          const now = new Date('2026-08-22T16:00:00.000Z');
          const purge = vi.fn(async () => 4);
          const execute = makeExecutePurgeExpiredWebhookReceipts({
            repo: { purge },
            clock: { now: () => now },
          });

          await expect(execute({})).resolves.toEqual({
            kind: 'success',
            value: { purgedCount: 4 },
          });
          expect(purge).toHaveBeenCalledWith(now);
        },
      },
    ],
  });
});
