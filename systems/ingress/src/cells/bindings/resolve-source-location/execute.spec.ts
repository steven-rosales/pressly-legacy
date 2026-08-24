import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, vi } from 'vitest';
import { resolveSourceLocationCellDeclaration } from './cell.ts';
import { makeExecuteResolveSourceLocation } from './execute.ts';

describe('resolve-source-location execution', () => {
  proveOperation({
    operationId: 'ingress.resolve-source-location.v1',
    declaration: resolveSourceLocationCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'delegates one exact source-scoped external identifier',
        proves: ['executor-success'],
        run: async () => {
          const resolve = vi.fn(async () => 'location-1');
          const execute = makeExecuteResolveSourceLocation({ resolve });
          const query = { source: 'cents', externalLocationId: 'store-1' };

          await expect(execute(query)).resolves.toEqual({
            kind: 'success',
            value: 'location-1',
          });
          expect(resolve).toHaveBeenCalledWith(query);
        },
      },
    ],
  });
});
