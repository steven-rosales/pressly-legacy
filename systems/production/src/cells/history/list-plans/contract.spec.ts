import { proveOperation } from '@pressly/testkit/operation-proof';
import { listHistoryPlansCellDeclaration } from './cell.ts';
import type { ListProductionHistoryPlansResult } from '../../../read-models/production-history/contract.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { listHistoryPlansContract } from './contract.ts';
import {
  listHistoryPlansCursorInvalid,
  listHistoryPlansLocationNotFound,
} from './failures.ts';

const result: ListProductionHistoryPlansResult = {
  items: [
    {
      scheduleRunId: '10000000-0000-4000-8000-000000000001',
      productionShiftId: '10000000-0000-4000-8000-000000000002',
      linkedProductionRunId: null,
      status: 'draft',
      shiftStartsAt: '2026-08-21T12:00:00.000Z',
      shiftEndsAt: '2026-08-21T20:00:00.000Z',
      algorithmVersion: 'fixed-pulse-ffd-v2',
      schedulerConfigId: '10000000-0000-4000-8000-000000000003',
      inputSnapshotHash: 'a'.repeat(64),
      outputPlanHash: 'b'.repeat(64),
      pulseCapacityLbs: 100,
      batchCount: 2,
      makespanMinutes: 112,
      plannedCompletionAt: '2026-08-21T18:00:00.000Z',
      warningCount: 0,
      acknowledgedWarningCount: 0,
      createdAt: '2026-08-20T12:00:00.000Z',
      acceptedAt: null,
      acceptedBy: null,
      supersededAt: null,
    },
  ],
  nextCursor: null,
  asOf: '2026-08-21T15:00:00.000Z',
};

describe('list-history-plans cell contract', () => {
  proveOperation({
    operationId: 'production.list-history-plans.v1',
    declaration: listHistoryPlansCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'applies current query defaults and converts the temporal filter once',
        proves: ['contract'],
        run: () => {
          expect(
            listHistoryPlansContract.input.decode({
              params: { locationId: 'location-1' },
              query: {},
            }),
          ).toEqual({
            kind: 'valid',
            value: { locationId: 'location-1', limit: 50 },
          });

          const decoded = listHistoryPlansContract.input.decode({
            params: { locationId: 'location-1' },
            query: {
              cursor: 'cursor-value',
              limit: '25',
              runId: '10000000-0000-4000-8000-000000000004',
              search: '  plan  ',
              status: 'accepted',
              createdAfter: '2026-08-20T12:00:00.000Z',
            },
          });

          expect(decoded).toMatchObject({
            kind: 'valid',
            value: {
              locationId: 'location-1',
              cursor: 'cursor-value',
              limit: 25,
              search: 'plan',
              status: 'accepted',
            },
          });
          if (decoded.kind === 'valid') {
            expect(decoded.value.createdAfter).toEqual(
              new Date('2026-08-20T12:00:00.000Z'),
            );
            expect(
              listHistoryPlansContract.input.encode(decoded.value),
            ).toEqual({
              params: { locationId: 'location-1' },
              query: {
                cursor: 'cursor-value',
                limit: 25,
                runId: '10000000-0000-4000-8000-000000000004',
                search: 'plan',
                status: 'accepted',
                createdAfter: '2026-08-20T12:00:00.000Z',
              },
            });
          }
        },
      },
    ],
  });

  it('reports malformed params and query at separate boundary paths', () => {
    const decoded = listHistoryPlansContract.input.decode({
      params: { locationId: '' },
      query: { limit: 101, extra: true },
    });

    expect(decoded.kind).toBe('invalid');
    if (decoded.kind === 'invalid')
      expect(decoded.issues.map(({ path }) => path)).toEqual(
        expect.arrayContaining([
          ['params', 'locationId'],
          ['query', 'limit'],
          ['query'],
        ]),
      );
  });

  it('round-trips the exact current result schema', () => {
    const encoded = listHistoryPlansContract.output.encode(result);
    expect(listHistoryPlansContract.output.decode(encoded)).toEqual({
      kind: 'valid',
      value: result,
    });

    try {
      listHistoryPlansContract.output.encode({
        ...result,
        asOf: 'not-an-instant',
      });
      expect.unreachable('invalid output should throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error))
        expect(error.code).toBe('invalid_api_success_response');
    }
  });

  it('versions and round-trips both expected failures', () => {
    for (const failure of [
      listHistoryPlansLocationNotFound(),
      listHistoryPlansCursorInvalid(),
    ]) {
      const encoded = listHistoryPlansContract.failure.encode(failure);
      expect(listHistoryPlansContract.failure.decode(encoded)).toEqual({
        kind: 'valid',
        value: failure,
      });
    }
    expect(listHistoryPlansContract.input.version).toBe(1);
    expect(listHistoryPlansContract.output.version).toBe(1);
    expect(listHistoryPlansContract.failure.version).toBe(1);
  });
});
