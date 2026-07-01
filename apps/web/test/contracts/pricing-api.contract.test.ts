import { result } from '@pressly/kernel';
import { pricingCatalogSchema } from '@pressly/contracts';

const queryFetch = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/common/adapters/runtime/server-web-core', () => ({
  makeServerWebCore: () => ({
    query: {
      fetch: queryFetch,
    },
  }),
}));

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

    const { loadPricingCatalog } = await import('@/infra/pricing');
    const actual = await loadPricingCatalog({ serviceSlug: 'wash-fold' });

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
