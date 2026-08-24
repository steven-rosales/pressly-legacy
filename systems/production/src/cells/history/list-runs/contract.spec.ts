import { proveOperation } from '@pressly/testkit/operation-proof';
import { listHistoryRunsCellDeclaration } from './cell.ts';
import { describe, expect } from 'vitest';
import { listHistoryRunsContract } from './contract.ts';

describe('list-history-runs contract', () => {
  proveOperation({
    operationId: 'production.list-history-runs.v1',
    declaration: listHistoryRunsCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'applies the page default and maps inclusive createdAfter inward',
        proves: ['contract'],
        run: () => {
          expect(
            listHistoryRunsContract.input.decode({
              params: { locationId: 'location-1' },
              query: {
                search: ' north ',
                status: 'completed',
                createdAfter: '2026-08-21T14:00:00.000Z',
              },
            }),
          ).toEqual({
            kind: 'valid',
            value: {
              locationId: 'location-1',
              limit: 50,
              search: 'north',
              status: 'completed',
              createdAfter: new Date('2026-08-21T14:00:00.000Z'),
            },
          });
        },
      },
    ],
  });
});
