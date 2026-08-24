import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, vi } from 'vitest';
import { measureWebhookBacklogCellDeclaration } from './cell.ts';
import { makeExecuteMeasureWebhookBacklog } from './execute.ts';

describe('measure-webhook-backlog execution', () => {
  proveOperation({
    operationId: 'ingress.measure-webhook-backlog.v1',
    declaration: measureWebhookBacklogCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'measures through the current clock boundary',
        proves: ['executor-success'],
        run: async () => {
          const now = new Date('2026-08-22T16:00:00.000Z');
          const measure = vi.fn(async () => ({
            pendingCount: 3,
            oldestPendingAgeSeconds: 120,
          }));
          const execute = makeExecuteMeasureWebhookBacklog({
            repo: { measure },
            clock: { now: () => now },
          });

          await expect(execute({})).resolves.toEqual({
            kind: 'success',
            value: { pendingCount: 3, oldestPendingAgeSeconds: 120 },
          });
          expect(measure).toHaveBeenCalledWith(now);
        },
      },
    ],
  });
});
