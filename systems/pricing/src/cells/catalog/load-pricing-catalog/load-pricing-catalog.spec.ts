import { isAppError } from '@pressly/errors/app-error';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, it } from 'vitest';
import { loadPricingCatalogCellDeclaration } from './cell.ts';
import { loadPricingCatalogContract } from './contract.ts';
import { makeExecuteLoadPricingCatalog } from './execute.ts';

const query = { serviceSlug: 'wash-fold' } as const;

proveOperation({
  operationId: 'pricing.load-pricing-catalog.v1',
  declaration: loadPricingCatalogCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'owns the strict public catalog contract and GET protocol',
      proves: ['contract', 'protocol'],
      run: () => {
        expect(loadPricingCatalogContract.input.version).toBe(1);
        expect(loadPricingCatalogContract.input.decode(query)).toEqual({
          kind: 'valid',
          value: query,
        });
        expect(
          loadPricingCatalogContract.input.decode({ ...query, extra: true })
            .kind,
        ).toBe('invalid');
        expect(loadPricingCatalogCellDeclaration).toMatchObject({
          id: 'pricing.load-pricing-catalog.v1',
          kind: 'query',
          consistency: { transaction: 'none', concurrency: 'none' },
          idempotency: { required: false },
          surfaces: [
            {
              kind: 'http',
              method: 'GET',
              path: '/pricing/services/:serviceSlug/pricing',
              bodyLimit: null,
              contextRequirements: [],
            },
          ],
        });
      },
    },

    {
      name: 'returns pricing_not_found as typed query data',
      proves: ['executor-success'],
      run: async () => {
        const execute = makeExecuteLoadPricingCatalog(async () => ({
          kind: 'missing' as const,
          missing: 'service' as const,
        }));

        await expect(execute(query)).resolves.toEqual({
          kind: 'failure',
          failure: {
            code: 'pricing_not_found',
            serviceSlug: 'wash-fold',
            missing: 'service',
          },
        });
      },
    },

    {
      name: 'executes and serializes an empty catalog as success',
      proves: ['executor-success'],
      run: async () => {
        const catalog = {
          serviceSlug: 'wash-fold',
          currency: 'USD',
          updatedAt: new Date('2026-05-21T12:00:00.000Z'),
          items: [],
        } as const;
        expect(loadPricingCatalogContract.output.encode(catalog)).toEqual({
          ...catalog,
          updatedAt: '2026-05-21T12:00:00.000Z',
        });
        const execute = makeExecuteLoadPricingCatalog(async () => ({
          kind: 'found',
          catalog,
        }));

        await expect(execute(query)).resolves.toEqual({
          kind: 'success',
          value: catalog,
        });
      },
    },
  ],
});

it('maps an unexpected repository read through the operation database rail', async () => {
  const execute = makeExecuteLoadPricingCatalog(async () => {
    throw Object.freeze({ kind: 'fixture-database-fault' });
  });

  await expect(execute(query)).rejects.toSatisfy(
    (error: unknown) =>
      isAppError(error) &&
      error.code === 'pricing_read_failed' &&
      error.status === 503,
  );
});
