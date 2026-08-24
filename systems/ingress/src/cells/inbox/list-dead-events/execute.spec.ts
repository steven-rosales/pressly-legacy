import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, vi } from 'vitest';
import { listDeadEventsCellDeclaration } from './cell.ts';
import { makeExecuteListDeadEvents } from './execute.ts';

const event = (suffix: number) => ({
  eventId: `81000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`,
  source: 'cents',
  eventType: 'order_updated',
  subjectType: 'order',
  subjectId: `order-${suffix}`,
  sourceLocationId: 'store-1',
  sourceOccurredAt: null,
  attempts: 3,
  lastErrorCode: 'projection_failed',
  receivedAt: new Date('2026-08-22T15:00:00.000Z'),
});

describe('list-dead-events execution', () => {
  proveOperation({
    operationId: 'ingress.list-dead-events.v1',
    declaration: listDeadEventsCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'overfetches cursor without payload or private error text',
        proves: ['executor-success'],
        run: async () => {
          const list = vi.fn(async () => [event(1), event(2), event(3)]);
          const execute = makeExecuteListDeadEvents({
            repo: { list },
            clock: { now: () => new Date('2026-08-22T16:00:00.000Z') },
          });

          await expect(execute({ source: 'cents', limit: 2 })).resolves.toEqual(
            {
              kind: 'success',
              value: {
                items: [event(1), event(2)],
                nextEventId: event(2).eventId,
                asOf: new Date('2026-08-22T16:00:00.000Z'),
              },
            },
          );
          expect(list).toHaveBeenCalledWith({ source: 'cents', limit: 3 });
          expect(event(1)).not.toHaveProperty('payload');
          expect(event(1)).not.toHaveProperty('lastErrorMessage');
        },
      },
    ],
  });
});
