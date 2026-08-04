import { result } from '@pressly/kernel';
import { pricingCatalogSchema } from '@pressly/contracts/pricing';
import { makePricingQueries } from '@/features/pricing/queries';

const queryFetch = vi.hoisted(() => vi.fn());

describe('pricing API contract', () => {
  beforeEach(() => {
    queryFetch.mockReset();
  });

  it('loads pricing through the shared API route and catalog schema', async () => {
    const catalog = {
      serviceSlug: 'wash-fold',
      currency: 'USD',
      updatedAt: '2026-07-01T00:00:00.000Z',
      items: [
        {
          service: 'wash_fold',
          unit: 'lb',
          category: 'Base',
          name: 'Wash & Fold',
          priceCents: 175,
          sortOrder: 10,
          metadata: {},
        },
      ],
    };

    queryFetch.mockResolvedValue(result.ok(catalog));

    const queries = makePricingQueries({ fetch: queryFetch });
    const actual = await queries.loadCatalog({ serviceSlug: 'wash-fold' });

    expect(actual).toEqual(result.ok(catalog));
    expect(queryFetch).toHaveBeenCalledWith({
      meta: {
        action: 'load_pricing_catalog',
        rail: 'query',
        criticality: 'low',
        source: 'pricing',
      },
      request: {
        method: 'GET',
        path: '/pricing/services/wash-fold/pricing',
        response: pricingCatalogSchema,
        next: { revalidate: 3600, tags: ['pricing'] },
      },
    });
  });
});
