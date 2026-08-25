import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { installIngressPostgresFixture } from '../../../testing/postgres-fixture.ts';
import { resolveSourceLocationCellDeclaration } from './cell.ts';

const fixture = installIngressPostgresFixture();

proveOperation({
  operationId: 'ingress.resolve-source-location.v1',
  declaration: resolveSourceLocationCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'reads only the exact active source identity',
      proves: ['contract', 'executor-success'],
      run: async () => {
        expect(resolveSourceLocationCellDeclaration).toMatchObject({
          id: 'ingress.resolve-source-location.v1',
          kind: 'query',
          consistency: { transaction: 'none', concurrency: 'none' },
        });
        await fixture.insertBinding({
          source: 'cents',
          externalLocationId: 'store-1',
        });
        await fixture.insertBinding({
          source: 'cents',
          externalLocationId: 'inactive-store',
          isActive: false,
        });
        const cell = fixture.makeSystem().cells.resolveSourceLocation;
        expect(
          await cell.execute({
            source: 'cents',
            externalLocationId: 'store-1',
          }),
        ).toEqual({ kind: 'success', value: 'location-1' });
        expect(
          await cell.execute({
            source: 'another-source',
            externalLocationId: 'store-1',
          }),
        ).toEqual({ kind: 'success', value: null });
        expect(
          await cell.execute({
            source: 'cents',
            externalLocationId: 'inactive-store',
          }),
        ).toEqual({ kind: 'success', value: null });
      },
    },

    {
      name: 'maps an unavailable binding read without state change',
      proves: ['executor-success'],
      run: async () => {
        await fixture.insertBinding({
          source: 'cents',
          externalLocationId: 'store-1',
        });
        const cell = fixture.makeSystem().cells.resolveSourceLocation;
        await expect(
          fixture.withUnavailableTable('source_location_bindings', () =>
            cell.execute({ source: 'cents', externalLocationId: 'store-1' }),
          ),
        ).rejects.toMatchObject({
          kind: 'DatabaseError',
          code: 'source_location_bindings_failed',
        });
        expect(await fixture.readCounts()).toMatchObject({ bindings: 1 });
      },
    },
  ],
});
