vi.mock('@/infra/pricing', () => ({
  loadPricingCatalog: vi.fn().mockResolvedValue({
    ok: false,
    error: {
      code: 'pricing_unavailable',
      message: 'Pricing unavailable in tests.',
    },
  }),
}));

import {
  getCityServicePageModel,
  getCountyPageModel,
  getNewJerseyPageModel,
} from './model';

describe('new jersey page models', () => {
  it('builds the state page model without route component logic', async () => {
    const model = await getNewJerseyPageModel();

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
    const model = await getCountyPageModel('bergen-county');

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
      'bergen-county',
      'laundry-service-in-fort-lee',
    );

    expect(model?.hero.heading).toBe(
      'Fort Lee Wash & Fold Laundry Service',
    );
    expect(model?.localProof?.cityName).toBe('Fort Lee');
    await expect(
      getCityServicePageModel('bergen-county', 'unknown'),
    ).resolves.toBeNull();
  });
});
