import { proveOperation } from '@pressly/testkit/operation-proof';
import { listOrderControlCellDeclaration } from './cell.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteListOrderControl } from './execute.ts';

const input = {
  locationId: 'location-1',
  view: 'attention' as const,
  limit: 25,
};
const asOf = new Date('2026-08-22T15:00:00.000Z');

describe('execute list order control', () => {
  proveOperation({
    operationId: 'production.list-order-control.v1',
    declaration: listOrderControlCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'reads one clock before the repository and serializes asOf',
        proves: ['executor-success'],
        run: async () => {
          const trace: string[] = [];
          const clock = vi.fn(() => {
            trace.push('clock');
            return asOf;
          });
          const list = vi.fn(async (_input, now: Date) => {
            trace.push('read');
            expect(now).toBe(asOf);
            return {
              kind: 'found' as const,
              result: {
                items: [],
                counts: { attention: 0, active: 0, all: 0 },
                nextCursor: null,
                asOf,
              },
            };
          });
          await expect(
            makeExecuteListOrderControl({
              repo: { list },
              clock: { now: clock },
            })(input),
          ).resolves.toMatchObject({
            kind: 'success',
            value: { asOf: asOf.toISOString() },
          });
          expect(clock).toHaveBeenCalledOnce();
          expect(trace).toEqual(['clock', 'read']);
        },
      },
    ],
  });

  it.each([
    ['location_not_found', 'production_location_not_found'],
    ['invalid_cursor', 'production_order_cursor_invalid'],
  ] as const)('maps %s to %s', async (kind, code) => {
    await expect(
      makeExecuteListOrderControl({
        repo: { list: async () => ({ kind }) },
        clock: { now: () => asOf },
      })(input),
    ).resolves.toMatchObject({ kind: 'failure', failure: { code } });
  });

  it('preserves owned AppErrors and maps unknown read failures', async () => {
    const owned = invariantViolationError({
      code: 'owned_order_control_fault',
      message: 'owned',
      safeMessage: 'owned',
    });
    for (const [fault, code] of [
      [owned, 'owned_order_control_fault'],
      [{ fixture: true }, 'production_order_control_list_failed'],
    ] as const) {
      const execute = makeExecuteListOrderControl({
        repo: {
          list: async () => {
            throw fault;
          },
        },
        clock: { now: () => asOf },
      });
      await expect(execute(input)).rejects.toMatchObject({ code });
    }
  });
});
