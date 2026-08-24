import * as result from '@pressly/cells/result';
import {
  toDryCleaningPricingModel,
  toWashFoldPricingModel,
} from '#customer/features/pricing/presenter';
import {
  loadPricingCatalogViewModel,
  type PricingQueries,
} from '#customer/features/pricing/queries';

const loadCatalog = vi.fn<PricingQueries['loadCatalog']>();
const pricingQueries: PricingQueries = { loadCatalog };

describe('marketing pricing view models', () => {
  beforeEach(() => {
    loadCatalog.mockReset();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses static fallback pricing without an API request during Docker builds', async () => {
    vi.stubEnv('PRESSLY_DOCKER_BUILD', 'true');

    const pricing = await loadPricingCatalogViewModel(
      pricingQueries,
      { serviceSlug: 'wash-fold' },
      { staticOnly: true },
    );
    const model = toWashFoldPricingModel(pricing.catalog);

    expect(loadCatalog).not.toHaveBeenCalled();
    expect(model.basePrice).toBe('$1.67');
    expect(model.hangDryPrice).toBe('$2.95');
    expect(model.deliveryFee.price).toBe('Free');
    expect(model.deliveryFee.shortCopy).toBe('free delivery');
    expect(model.deliveryFee.copy).toBe(
      'Pickup and delivery are free per order.',
    );
  });

  it('uses wash and fold prices from the pricing catalog', async () => {
    loadCatalog.mockResolvedValue(
      result.ok({
        serviceSlug: 'wash-fold',
        currency: 'USD',
        updatedAt: '2026-05-19T00:00:00.000Z',
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
          {
            service: 'wash_fold',
            unit: 'order',
            category: 'Minimum',
            name: 'Minimum',
            priceCents: 1800,
            sortOrder: 20,
            metadata: { minimumThresholdQuantity: 12 },
          },
          {
            service: 'wash_fold',
            unit: 'order',
            category: 'Fee',
            name: 'Delivery Fee',
            priceCents: 200,
            sortOrder: 30,
            metadata: {},
          },
          {
            service: 'wash_fold',
            unit: 'item',
            category: 'Other Services',
            name: 'Hang Dry',
            priceCents: 125,
            sortOrder: 40,
            metadata: {},
          },
        ],
      }),
    );

    const pricing = await loadPricingCatalogViewModel(pricingQueries, {
      serviceSlug: 'wash-fold',
    });
    const model = toWashFoldPricingModel(pricing.catalog);

    expect(model.basePrice).toBe('$1.75');
    expect(model.deliveryFee.price).toBe('$2');
    expect(model.deliveryFee.shortCopy).toBe('$2 delivery fee');
    expect(model.hangDryPrice).toBe('$1.25');
    expect(model.minimumPrice).toBe('$18');
    expect(model.minimumThresholdQuantity).toBe(12);
  });

  it('uses dry cleaning prices from the pricing catalog', async () => {
    loadCatalog.mockResolvedValue(
      result.ok({
        serviceSlug: 'dry-cleaning',
        currency: 'USD',
        updatedAt: '2026-05-19T00:00:00.000Z',
        items: [
          {
            service: 'dry_cleaning',
            unit: 'order',
            category: 'Minimum',
            name: 'Minimum',
            priceCents: 2200,
            sortOrder: 10,
            metadata: {},
          },
          {
            service: 'dry_cleaning',
            unit: 'order',
            category: 'Fee',
            name: 'Delivery Fee',
            priceCents: 350,
            sortOrder: 20,
            metadata: {},
          },
          {
            service: 'dry_cleaning',
            unit: 'item',
            category: 'Other Services',
            name: 'Launder & Press',
            priceCents: 425,
            sortOrder: 30,
            metadata: {},
          },
          {
            service: 'dry_cleaning',
            unit: 'item',
            category: 'Garments',
            name: 'Shirt',
            priceCents: 625,
            sortOrder: 100,
            metadata: {},
          },
        ],
      }),
    );

    const pricing = await loadPricingCatalogViewModel(pricingQueries, {
      serviceSlug: 'dry-cleaning',
    });
    const model = toDryCleaningPricingModel(pricing.catalog);

    expect(model.deliveryFee.price).toBe('$3.50');
    expect(model.deliveryFee.shortCopy).toBe('$3.50 delivery fee');
    expect(model.launderPressPrice).toBe('$4.25');
    expect(model.minimumPrice).toBe('$22.00');
    expect(model.previewItems).toEqual([{ name: 'Shirt', price: '$6.25' }]);
  });

  it('renders free delivery from the pricing catalog', async () => {
    loadCatalog.mockResolvedValue(
      result.ok({
        serviceSlug: 'wash-fold',
        currency: 'USD',
        updatedAt: '2026-05-19T00:00:00.000Z',
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
          {
            service: 'wash_fold',
            unit: 'order',
            category: 'Fee',
            name: 'Delivery Fee',
            priceCents: 0,
            sortOrder: 30,
            metadata: {},
          },
        ],
      }),
    );

    const pricing = await loadPricingCatalogViewModel(pricingQueries, {
      serviceSlug: 'wash-fold',
    });
    const model = toWashFoldPricingModel(pricing.catalog);

    expect(model.deliveryFee.price).toBe('Free');
    expect(model.deliveryFee.shortCopy).toBe('free delivery');
    expect(model.deliveryFee.copy).toBe(
      'Pickup and delivery are free per order.',
    );
  });
});
