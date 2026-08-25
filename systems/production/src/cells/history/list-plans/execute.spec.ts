import { proveOperation } from '@pressly/testkit/operation-proof';
import { listHistoryPlansCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { invariantViolationError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteListHistoryPlans } from './execute.ts';
import type {
  HistoryPlan,
  ListHistoryPlansExpectedFailure,
  ListHistoryPlansRepository,
} from './types.ts';

const asOf = new Date('2026-08-21T15:00:00.000Z');
const input = { locationId: 'location-1', limit: 50 } as const;

const plan: HistoryPlan = {
  scheduleRunId: '10000000-0000-4000-8000-000000000001',
  productionShiftId: '10000000-0000-4000-8000-000000000002',
  linkedProductionRunId: null,
  status: 'draft',
  shiftStartsAt: new Date('2026-08-21T12:00:00.000Z'),
  shiftEndsAt: new Date('2026-08-21T20:00:00.000Z'),
  algorithmVersion: 'fixed-pulse-ffd-v2',
  schedulerConfigId: '10000000-0000-4000-8000-000000000003',
  inputSnapshotHash: 'a'.repeat(64),
  outputPlanHash: 'b'.repeat(64),
  pulseCapacityLbs: 100,
  batchCount: 2,
  makespanMinutes: 112,
  plannedCompletionAt: new Date('2026-08-21T18:00:00.000Z'),
  warningCount: 0,
  acknowledgedWarningCount: 0,
  createdAt: new Date('2026-08-20T12:00:00.000Z'),
  acceptedAt: null,
  acceptedBy: null,
  supersededAt: null,
};

const expectedFailureCases: readonly Readonly<{
  name: string;
  kind: 'invalid_cursor' | 'location_not_found';
  failure: ListHistoryPlansExpectedFailure;
}>[] = [
  {
    name: 'missing location',
    kind: 'location_not_found',
    failure: {
      tag: 'ProductionFailure',
      kind: 'not_found',
      code: 'production_location_not_found',
      message: 'The production location was not found.',
      safeMessage: 'The production location was not found.',
    },
  },
  {
    name: 'invalid cursor',
    kind: 'invalid_cursor',
    failure: {
      tag: 'ProductionFailure',
      kind: 'validation',
      classification: 'malformed',
      code: 'production_history_cursor_invalid',
      message: 'The production-history cursor is invalid for these filters.',
      safeMessage:
        'The production-history cursor is invalid for these filters.',
    },
  },
];

describe('list-history-plans executor', () => {
  proveOperation({
    operationId: 'production.list-history-plans.v1',
    declaration: listHistoryPlansCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'uses one clock value for the repository snapshot and wire asOf',
        proves: ['executor-success'],
        run: async () => {
          const list = vi.fn<ListHistoryPlansRepository['list']>(async () => ({
            kind: 'found',
            page: { items: [plan], nextCursor: 'next-page', asOf },
          }));
          const now = vi.fn(() => asOf);
          const execute = makeExecuteListHistoryPlans({
            repo: { list },
            clock: { now },
          });

          await expect(execute(input)).resolves.toMatchObject({
            kind: 'success',
            value: {
              items: [
                {
                  scheduleRunId: plan.scheduleRunId,
                  createdAt: '2026-08-20T12:00:00.000Z',
                },
              ],
              nextCursor: 'next-page',
              asOf: asOf.toISOString(),
            },
          });
          expect(now).toHaveBeenCalledOnce();
          expect(list).toHaveBeenCalledWith(input, asOf);
        },
      },
    ],
  });

  it.each(expectedFailureCases)(
    'returns the exact typed $name failure',
    async ({ kind, failure }) => {
      const execute = makeExecuteListHistoryPlans({
        repo: { list: async () => ({ kind }) },
        clock: { now: () => asOf },
      });

      await expect(execute(input)).resolves.toEqual({
        kind: 'failure',
        failure,
      });
    },
  );

  it('maps unknown persistence faults to the exact current database error', async () => {
    const execute = makeExecuteListHistoryPlans({
      repo: {
        list: async () => {
          throw { fault: 'database offline' };
        },
      },
      clock: { now: () => asOf },
    });

    await expect(execute(input)).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'DatabaseError',
      code: 'production_history_plans_list_failed',
      message: 'Production plan history could not be loaded.',
      safeMessage: 'Production plan history could not be loaded.',
      status: 503,
    });
  });

  it('preserves an owned invariant failure from the repository', async () => {
    const owned = invariantViolationError({
      code: 'history_projection_invalid',
      message: 'History projection is invalid.',
    });
    const execute = makeExecuteListHistoryPlans({
      repo: {
        list: async () => Promise.reject(owned),
      },
      clock: { now: () => asOf },
    });

    try {
      await execute(input);
      expect.unreachable('owned failure should throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toBe(owned);
    }
  });
});
