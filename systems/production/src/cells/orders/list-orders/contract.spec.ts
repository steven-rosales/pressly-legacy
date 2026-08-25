import { proveOperation } from '@pressly/testkit/operation-proof';
import { listOrdersCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { listOrdersContract } from './contract.ts';

describe('list-orders contract', () => {
  proveOperation({
    operationId: 'production.list-orders.v1',
    declaration: listOrdersCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'applies defaults and maps validated timestamps inward',
        proves: ['contract'],
        run: () => {
          expect(
            listOrdersContract.input.decode({
              params: { locationId: 'location-1' },
              query: {
                status: 'eligible',
                dueAfter: '2026-08-21T12:00:00.000Z',
                dueBefore: '2026-08-22T12:00:00.000Z',
              },
            }),
          ).toEqual({
            kind: 'valid',
            value: {
              locationId: 'location-1',
              status: 'eligible',
              dueAfter: new Date('2026-08-21T12:00:00.000Z'),
              dueBefore: new Date('2026-08-22T12:00:00.000Z'),
              limit: 50,
            },
          });
        },
      },
    ],
  });

  it('rejects reversed strict due bounds', () => {
    expect(
      listOrdersContract.input.decode({
        params: { locationId: 'location-1' },
        query: {
          dueAfter: '2026-08-22T12:00:00.000Z',
          dueBefore: '2026-08-21T12:00:00.000Z',
        },
      }).kind,
    ).toBe('invalid');
  });
});
