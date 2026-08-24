import { proveOperation } from '@pressly/testkit/operation-proof';
import { listLocationsCellDeclaration } from './cell.ts';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteListLocations } from './execute.ts';

describe('list-locations executor', () => {
  proveOperation({
    operationId: 'production.list-locations.v1',
    declaration: listLocationsCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'observes asOf after the repository list completes',
        proves: ['executor-success'],
        run: async () => {
          const calls: string[] = [];
          const execute = makeExecuteListLocations({
            repo: {
              list: vi.fn(async () => {
                calls.push('list');
                return [];
              }),
            },
            clock: {
              now: () => {
                calls.push('clock');
                return new Date('2026-08-21T14:00:00.000Z');
              },
            },
          });

          await expect(
            execute({ includeInactive: false, allowedLocationIds: [] }),
          ).resolves.toEqual({
            kind: 'success',
            value: { items: [], asOf: '2026-08-21T14:00:00.000Z' },
          });
          expect(calls).toEqual(['list', 'clock']);
        },
      },
    ],
  });

  it('classifies native repository failures', async () => {
    const cause = Object.freeze({ fixture: 'database unavailable' });
    const execute = makeExecuteListLocations({
      repo: { list: vi.fn().mockRejectedValue(cause) },
      clock: { now: () => new Date() },
    });

    await expect(
      execute({ includeInactive: false, allowedLocationIds: null }),
    ).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'DatabaseError',
      code: 'production_locations_list_failed',
      cause,
    });
  });
});
