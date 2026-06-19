vi.mock('@/infra/pricing', () => ({
  loadPricingCatalog: vi.fn(),
}));

import { result } from '@pressly/kernel';
import { loadPricingCatalog } from '@/infra/pricing';
import {
  loadDryCleaningPricingViewModel,
  loadWashFoldPricingViewModel,
} from './pricing';

const mockLoadPricingCatalog = vi.mocked(loadPricingCatalog);

describe('marketing pricing view models', () => {
  beforeEach(() => {
    mockLoadPricingCatalog.mockReset();
  });

  it('uses wash and fold prices from the pricing catalog', async () => {
    mockLoadPricingCatalog.mockResolvedValue(
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

    const model = await loadWashFoldPricingViewModel({
      locationSlug: 'wash-fold-pricing-test',
    });

    expect(model.basePrice).toBe('$1.75');
    expect(model.deliveryFee.price).toBe('$2');
    expect(model.deliveryFee.shortCopy).toBe('$2 delivery fee');
    expect(model.hangDryPrice).toBe('$1.25');
    expect(model.minimumPrice).toBe('$18');
    expect(model.minimumThresholdQuantity).toBe(12);
  });

  it('uses dry cleaning prices from the pricing catalog', async () => {
    mockLoadPricingCatalog.mockResolvedValue(
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

    const model = await loadDryCleaningPricingViewModel({
      locationSlug: 'dry-cleaning-pricing-test',
    });

    expect(model.deliveryFee.price).toBe('$3.50');
    expect(model.deliveryFee.shortCopy).toBe('$3.50 delivery fee');
    expect(model.launderPressPrice).toBe('$4.25');
    expect(model.minimumPrice).toBe('$22.00');
    expect(model.previewItems).toEqual([{ name: 'Shirt', price: '$6.25' }]);
  });
});
