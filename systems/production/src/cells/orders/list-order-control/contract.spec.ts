import { proveOperation } from '@pressly/testkit/operation-proof';
import { listOrderControlCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { listOrderControlContract } from './contract.ts';

describe('list order control contract', () => {
  proveOperation({
    operationId: 'production.list-order-control.v1',
    declaration: listOrderControlCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'preserves defaults, trimming, boolean strings, and bounded limit coercion',
        proves: ['contract'],
        run: () => {
          expect(
            listOrderControlContract.input.decode({
              params: { locationId: 'location-1' },
              query: {
                search: '  ORDER-1  ',
                priority: 'true',
                movable: 'false',
                limit: '100',
              },
            }),
          ).toEqual({
            kind: 'valid',
            value: {
              locationId: 'location-1',
              view: 'attention',
              search: 'ORDER-1',
              priority: true,
              movable: false,
              limit: 100,
            },
          });
          expect(
            listOrderControlContract.input.decode({
              params: { locationId: 'location-1' },
              query: {},
            }),
          ).toMatchObject({
            kind: 'valid',
            value: { view: 'attention', limit: 25 },
          });
          expect(
            listOrderControlContract.input.decode({
              params: { locationId: 'location-1' },
              query: { limit: 101 },
            }),
          ).toMatchObject({ kind: 'invalid' });
        },
      },
    ],
  });

  it('strictly rejects unknown params and query fields', () => {
    expect(
      listOrderControlContract.input.decode({
        params: { locationId: 'location-1', productionRunId: 'unexpected' },
        query: { dueBefore: '2026-08-22T00:00:00.000Z' },
      }),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('round-trips the empty exact result and both expected failures', () => {
    const output = {
      items: [],
      counts: { attention: 0, active: 0, all: 0 },
      nextCursor: null,
      asOf: '2026-08-22T15:00:00.000Z',
    };
    expect(
      listOrderControlContract.output.decode(
        listOrderControlContract.output.encode(output),
      ),
    ).toEqual({ kind: 'valid', value: output });
    for (const [kind, classification, code] of [
      ['not_found', undefined, 'production_location_not_found'],
      ['validation', 'malformed', 'production_order_cursor_invalid'],
    ] as const)
      expect(
        listOrderControlContract.failure.decode({
          tag: 'ProductionFailure',
          kind,
          ...(classification === undefined ? {} : { classification }),
          code,
        }),
      ).toMatchObject({ kind: 'valid', value: { code } });
  });
});
