import { buildLocationPageJsonLd } from '#customer/app/_lib/seo/location-schema';
import { buildOrganizationJsonLd } from '#customer/app/_lib/seo/site-schema';
import {
  buildServiceOfferCatalog,
  buildServicePricingPageJsonLd,
} from '#customer/app/_lib/seo/pricing-schema';
import { LOCATIONS } from '#customer/app/(marketing)/new-jersey/content/locations';
import { buildStaticCatalog } from '#customer/features/pricing/static-catalog';

const graphNodes = (value: Record<string, unknown>) =>
  (value['@graph'] as readonly Record<string, unknown>[] | undefined) ?? [];

describe('SEO schema contracts', () => {
  it('keeps the public organization graph', () => {
    const nodes = graphNodes(buildOrganizationJsonLd());

    expect(nodes.map((node) => node['@type'])).toEqual([
      'Organization',
      'LocalBusiness',
      'WebSite',
    ]);
  });

  it('keeps static wash-and-fold pricing offers', () => {
    const catalog = buildServiceOfferCatalog(
      'washFold',
      '/services-pricing/wash-fold',
      buildStaticCatalog('wash-fold'),
    );
    const items = catalog.itemListElement as readonly Record<string, unknown>[];

    expect(items.map((item) => item['name'])).toEqual(
      expect.arrayContaining([
        'Wash & Fold Laundry',
        'Wash & Fold Minimum',
        'Delivery Fee',
        'Hang Dry',
        'Small Comforter',
      ]),
    );
  });

  it('keeps service-pricing and location schema connected to offer catalogs', () => {
    const pricingCatalog = buildStaticCatalog('wash-fold');
    const serviceNodes = graphNodes(
      buildServicePricingPageJsonLd({
        name: 'Wash & Fold Laundry Service',
        description: 'Pricing contract test.',
        path: '/services-pricing/wash-fold',
        areaName: 'New Jersey',
        serviceType: 'washFold',
        pricingCatalog,
        breadcrumbs: [
          { name: 'Home', path: '/' },
          { name: 'Wash & Fold', path: '/services-pricing/wash-fold' },
        ],
      }),
    );
    const location = LOCATIONS.find(
      (entry) =>
        entry.county === 'bergen-county' && entry.citySlug === 'fort-lee',
    );

    expect(location).toBeDefined();

    const locationNodes = graphNodes(
      buildLocationPageJsonLd({
        location: location!,
        serviceType: 'washFold',
        name: 'Fort Lee Wash & Fold Laundry Service',
        description: 'Location schema contract test.',
        path: '/new-jersey/bergen-county/laundry-service-in-fort-lee',
        breadcrumbs: [
          { name: 'Home', path: '/' },
          { name: 'Fort Lee', path: '/new-jersey/bergen-county' },
        ],
        faqs: [{ question: 'How?', answer: 'Schedule online.' }],
        pricingCatalog,
      }),
    );

    expect(serviceNodes.some((node) => node['@type'] === 'OfferCatalog')).toBe(
      true,
    );
    expect(
      locationNodes.some((node) => node['@type'] === 'DryCleaningOrLaundry'),
    ).toBe(true);
    expect(locationNodes.some((node) => node['@type'] === 'OfferCatalog')).toBe(
      true,
    );
  });
});
