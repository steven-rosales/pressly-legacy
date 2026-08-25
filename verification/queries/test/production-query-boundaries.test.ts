import { listHistoryRunsContract } from '@pressly/production-system/operations/history/list-runs/contract';
import { listLocationsContract } from '@pressly/production-system/operations/resources/list-locations/contract';
import { listOrdersContract } from '@pressly/production-system/operations/orders/list-orders/contract';
import { describe, expect, it } from 'vitest';
import { productionQueryConformanceLocations as locations } from '../src/public.ts';

describe('Production query serialized boundary conformance', () => {
  it('keeps list-locations defaults and requires an explicit authorization scope', () => {
    expect(
      listLocationsContract.input.decode({
        query: {},
        allowedLocationIds: null,
      }),
    ).toEqual({
      kind: 'valid',
      value: { includeInactive: false, allowedLocationIds: null },
    });
    expect(
      listLocationsContract.input.decode({
        query: { includeInactive: 'true' },
        allowedLocationIds: [],
      }),
    ).toEqual({
      kind: 'valid',
      value: { includeInactive: true, allowedLocationIds: [] },
    });
    expect(
      listLocationsContract.input.decode({
        query: {},
      }),
    ).toEqual({
      kind: 'invalid',
      issues: [
        {
          path: ['authorization', 'allowedLocationIds'],
          message: 'Allowed location IDs must be null or an array of strings.',
        },
      ],
    });
  });

  it('keeps list-orders page defaults and timestamp/filter normalization', () => {
    expect(
      listOrdersContract.input.decode({
        params: { locationId: locations.main },
        query: {},
      }),
    ).toEqual({
      kind: 'valid',
      value: { locationId: locations.main, limit: 50 },
    });
    expect(
      listOrdersContract.input.decode({
        params: { locationId: locations.main },
        query: {
          status: 'scheduled',
          dueAfter: '2026-08-21T03:59:59.000Z',
          dueBefore: '2026-08-22T04:00:00.000Z',
          limit: '25',
        },
      }),
    ).toEqual({
      kind: 'valid',
      value: {
        locationId: locations.main,
        status: 'scheduled',
        dueAfter: new Date('2026-08-21T03:59:59.000Z'),
        dueBefore: new Date('2026-08-22T04:00:00.000Z'),
        limit: 25,
      },
    });
    expect(
      listOrdersContract.input.decode({
        params: { locationId: locations.main },
        query: {
          dueAfter: '2026-08-22T04:00:00.000Z',
          dueBefore: '2026-08-21T03:59:59.000Z',
        },
      }).kind,
    ).toBe('invalid');
  });

  it('keeps list-history-runs page defaults and trimmed filter normalization', () => {
    expect(
      listHistoryRunsContract.input.decode({
        params: { locationId: locations.main },
        query: {},
      }),
    ).toEqual({
      kind: 'valid',
      value: { locationId: locations.main, limit: 50 },
    });
    expect(
      listHistoryRunsContract.input.decode({
        params: { locationId: locations.main },
        query: {
          search: '  CONFORMANCE  ',
          status: 'completed',
          createdAfter: '2026-08-21T15:45:00.000Z',
          limit: '20',
        },
      }),
    ).toEqual({
      kind: 'valid',
      value: {
        locationId: locations.main,
        search: 'CONFORMANCE',
        status: 'completed',
        createdAfter: new Date('2026-08-21T15:45:00.000Z'),
        limit: 20,
      },
    });
  });
});
