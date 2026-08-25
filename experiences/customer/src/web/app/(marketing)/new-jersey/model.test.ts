import { getNewJerseyPageModel } from '#customer/app/(marketing)/new-jersey/model';
import { getCountyPageModel } from '#customer/app/(marketing)/new-jersey/[county]/model';
import { getCityServicePageModel } from '#customer/app/(marketing)/new-jersey/[county]/[slug]/model';
import type { PricingCatalogLoader } from '#customer/features/pricing/model';
import { buildStaticCatalog } from '#customer/features/pricing/static-catalog';

const loadPricing: PricingCatalogLoader = async ({ serviceSlug }) => ({
  source: 'static-fallback',
  catalog: buildStaticCatalog(serviceSlug),
});

describe('new jersey page models', () => {
  it('builds the state page model without route component logic', async () => {
    const model = await getNewJerseyPageModel(loadPricing);

    expect(model.hero.heading).toBe(
      'New Jersey Laundry Service & Dry Cleaning',
    );
    expect(model.jsonLd).toHaveLength(2);
    expect(model.servicePanels.map((panel) => panel.service)).toEqual([
      'washFold',
      'dryCleaning',
    ]);
  });

  it('builds county links for both laundry and dry cleaning city pages', async () => {
    const model = await getCountyPageModel(loadPricing, 'bergen-county');

    expect(model?.hero.heading).toContain('Bergen County');
    expect(model?.linksGrid?.items[0]).toEqual(
      expect.objectContaining({
        primaryHref: expect.stringContaining('laundry-service-in-'),
        secondaryHref: expect.stringContaining('dry-cleaners-in-'),
      }),
    );
  });

  it('builds city service proof and rejects unknown city service routes', async () => {
    const model = await getCityServicePageModel(
      loadPricing,
      'bergen-county',
      'laundry-service-in-fort-lee',
    );

    expect(model?.hero.heading).toBe('Fort Lee Wash & Fold Laundry Service');
    expect(model?.localProof?.cityName).toBe('Fort Lee');
    expect(model?.localProof?.deliveryFeeShortCopy).toBe('free delivery');
    expect(model?.localProof?.faqs[0]?.answer).toContain(
      'Pickup and delivery are free per order.',
    );
    await expect(
      getCityServicePageModel(loadPricing, 'bergen-county', 'unknown'),
    ).resolves.toBeNull();
  });
});
