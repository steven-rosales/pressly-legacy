import { proveOperation } from '@pressly/testkit/operation-proof';
import { listHistoryActivityCellDeclaration } from './cell.ts';
import type { ListProductionHistoryActivityResult } from '../../../read-models/production-history/contract.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { listHistoryActivityContract } from './contract.ts';
import {
  listHistoryActivityCursorInvalid,
  listHistoryActivityLocationNotFound,
} from './failures.ts';

const ids = {
  event: '10000000-0000-4000-8000-000000000001',
  entity: '10000000-0000-4000-8000-000000000002',
  actor: '10000000-0000-4000-8000-000000000003',
  run: '10000000-0000-4000-8000-000000000004',
} as const;

const result: ListProductionHistoryActivityResult = {
  items: [
    {
      id: ids.event,
      eventType: 'stage_completed',
      entityType: 'stage_run',
      entityId: ids.entity,
      actor: { id: ids.actor, kind: 'user', displayName: 'Alex' },
      expectedVersion: 2,
      productionRunId: ids.run,
      resolutionAction: null,
      summary: 'Production stage completed',
      details: {
        kind: 'stage',
        action: 'completed',
        version: 3,
        machineIds: [],
        timingConfirmationRecorded: false,
      },
      occurredAt: '2026-08-21T12:00:00.000Z',
    },
  ],
  nextCursor: null,
  asOf: '2026-08-21T15:00:00.000Z',
};

describe('list-history-activity cell contract', () => {
  proveOperation({
    operationId: 'production.list-history-activity.v1',
    declaration: listHistoryActivityCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'applies exact defaults and maps every normalized filter',
        proves: ['contract'],
        run: () => {
          expect(
            listHistoryActivityContract.input.decode({
              params: { locationId: 'location-1' },
              query: {},
            }),
          ).toEqual({
            kind: 'valid',
            value: { locationId: 'location-1', limit: 50 },
          });

          const decoded = listHistoryActivityContract.input.decode({
            params: { locationId: 'location-1' },
            query: {
              cursor: 'cursor-value',
              limit: '100',
              runId: ids.run,
              entityType: 'production_order',
              eventType: 'production_order_restored',
              orderResolution: 'restored',
              search: '  Manager  ',
              occurredAfter: '2026-08-20T12:00:00.000Z',
            },
          });

          expect(decoded).toMatchObject({
            kind: 'valid',
            value: {
              locationId: 'location-1',
              cursor: 'cursor-value',
              limit: 100,
              runId: ids.run,
              entityType: 'production_order',
              eventType: 'production_order_restored',
              orderResolution: 'restored',
              search: 'Manager',
            },
          });
          if (decoded.kind === 'valid') {
            expect(decoded.value.occurredAfter).toEqual(
              new Date('2026-08-20T12:00:00.000Z'),
            );
            expect(
              listHistoryActivityContract.input.encode(decoded.value),
            ).toEqual({
              params: { locationId: 'location-1' },
              query: {
                cursor: 'cursor-value',
                limit: 100,
                runId: ids.run,
                entityType: 'production_order',
                eventType: 'production_order_restored',
                orderResolution: 'restored',
                search: 'Manager',
                occurredAfter: '2026-08-20T12:00:00.000Z',
              },
            });
          }
        },
      },
    ],
  });

  it('keeps the params and query schemas strict and caps pages at 100', () => {
    const decoded = listHistoryActivityContract.input.decode({
      params: { locationId: '', extra: true },
      query: { limit: 101, extra: true },
    });

    expect(decoded.kind).toBe('invalid');
    if (decoded.kind === 'invalid')
      expect(decoded.issues.map(({ path }) => path)).toEqual(
        expect.arrayContaining([
          ['params', 'locationId'],
          ['params'],
          ['query', 'limit'],
          ['query'],
        ]),
      );
  });

  it('round-trips only the sanitized Production result contract', () => {
    const encoded = listHistoryActivityContract.output.encode(result);
    expect(listHistoryActivityContract.output.decode(encoded)).toEqual({
      kind: 'valid',
      value: result,
    });

    for (const privateResult of [
      {
        ...result,
        items: [{ ...result.items[0], payload: { private: true } }],
      },
      {
        ...result,
        items: [{ ...result.items[0], identity: { displayNumber: 'ORDER-1' } }],
      },
    ])
      expect(
        listHistoryActivityContract.output.decode(privateResult).kind,
      ).toBe('invalid');

    try {
      listHistoryActivityContract.output.encode({
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
      listHistoryActivityLocationNotFound(),
      listHistoryActivityCursorInvalid(),
    ]) {
      const encoded = listHistoryActivityContract.failure.encode(failure);
      expect(listHistoryActivityContract.failure.decode(encoded)).toEqual({
        kind: 'valid',
        value: failure,
      });
    }
    expect(listHistoryActivityContract.input.version).toBe(1);
    expect(listHistoryActivityContract.output.version).toBe(1);
    expect(listHistoryActivityContract.failure.version).toBe(1);
  });
});
