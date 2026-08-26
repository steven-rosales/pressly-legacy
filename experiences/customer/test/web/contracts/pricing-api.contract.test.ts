import * as result from '@pressly/cells/result';
import { makePricingQueries } from '#customer/features/pricing/queries';

const queryRun = vi.hoisted(() => vi.fn());
const loadCatalog = vi.hoisted(() => vi.fn());

describe('pricing API contract', () => {
  beforeEach(() => {
    queryRun.mockReset();
    loadCatalog.mockReset();
  });

  it('loads pricing through the direct Customer client with unchanged query observation', async () => {
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

    loadCatalog.mockResolvedValue(catalog);
    queryRun.mockImplementation(async ({ work }) => result.ok(await work()));

    const queries = makePricingQueries({
      query: { run: queryRun },
      pricing: { loadCatalog },
    });
    const actual = await queries.loadCatalog({ serviceSlug: 'wash-fold' });

    expect(actual).toEqual(result.ok(catalog));
    expect(loadCatalog).toHaveBeenCalledExactlyOnceWith('wash-fold');
    expect(queryRun).toHaveBeenCalledWith({
      meta: {
        action: 'load_pricing_catalog',
        rail: 'query',
        criticality: 'low',
        source: 'pricing',
      },
      work: expect.any(Function),
    });
  });
});
