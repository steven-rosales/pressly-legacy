import { buildLocationPageJsonLd } from '#customer/app/_lib/seo/location-schema';
import { formatCountyName } from '#customer/app/_lib/seo/site-schema';
import { ORDER_ENTRY_OFFER_COPY } from '#customer/features/order-entry/content';
import type { PricingCatalogLoader } from '#customer/features/pricing/model';

import { resolveCityService } from '../../content/helpers';
import { getLocalProof } from '../../content/local-proof';
import { makeTitle } from '../../content/seo-versions';
import {
  buildCityHiwSteps,
  cityServiceSection,
  getLocationServicePanel,
  serviceLabel,
  serviceNoun,
  type LocationPageModel,
} from '../../_shared/model';

export const getCityServicePageModel = async (
  loadPricing: PricingCatalogLoader,
  county: string,
  slug: string,
): Promise<LocationPageModel | null> => {
  const resolved = resolveCityService(county, slug);
  if (resolved === null) return null;

  const { location, serviceConfig, serviceType } = resolved;
  const { cityName, heroImage, versions } = location;
  const countyName = formatCountyName(county);
  const servicePanel = await getLocationServicePanel(
    loadPricing,
    serviceConfig.isDryCleaningService ? 'dryCleaning' : 'washFold',
  );
  const proof = getLocalProof(
    location,
    serviceType,
    servicePanel.pricing.deliveryFee,
  );
  const path = `/new-jersey/${county}/${slug}`;
  const heading = `${cityName} ${serviceLabel(serviceType)} ${serviceNoun(
    serviceType,
  )}`;
  const description = makeTitle(
    'seoCityHeroDescription',
    versions?.seoCityHeroDescription ?? 1,
    { city: cityName },
    undefined,
    serviceType,
  );

  return {
    jsonLd: [
      buildLocationPageJsonLd({
        location,
        serviceType,
        name: heading,
        description,
        path,
        breadcrumbs: [
          { name: 'Home', path: '/' },
          { name: 'New Jersey', path: '/new-jersey' },
          { name: `${countyName} County`, path: `/new-jersey/${county}` },
          { name: heading, path },
        ],
        faqs: proof.faqs,
        pricingCatalog: servicePanel.catalog,
      }),
    ],
    hero: {
      image: heroImage,
      heading,
      description,
      cityName,
      offerText: ORDER_ENTRY_OFFER_COPY,
      ctaSource: 'location_hero',
    },
    hiw: {
      heading:
        serviceType === 'dryCleaning'
          ? `How your dry cleaning pickup works in ${cityName}.`
          : `How your laundry pickup works in ${cityName}`,
      steps: buildCityHiwSteps(cityName, serviceType, versions ?? {}),
    },
    servicePanels: [servicePanel],
    serviceSectionClassName: cityServiceSection,
    story: {
      title: `Pressly & ${cityName}`,
      heading: makeTitle(
        'seoCityDescriptionTitle',
        versions?.seoCityDescriptionTitle,
        { city: cityName },
        undefined,
        serviceType,
      ),
      paragraphs: [
        makeTitle(
          'seoCityDescription',
          versions?.seoCityDescription,
          { city: cityName },
          undefined,
          serviceType,
        ),
      ],
      heroImage,
      locationLabel: cityName,
    },
    localProof: proof,
    testimonialsClassName: 'mx-auto max-w-[1440px] px-4 py-28 sm:px-6 lg:py-20',
    bottom:
      serviceType === 'dryCleaning'
        ? {
            title: `Pressed and ready in ${cityName}`,
            description:
              "Schedule your dry cleaning pickup, and we'll return your garments pressed, crisp, and ready to wear—no extra errands, just a warm hand-off at your door.",
          }
        : {
            title: `Never fold again in ${cityName}`,
            description:
              "Book a pickup, hand off your laundry, and get everything back fresh, soft, and neatly folded. It's the easiest way to keep your week light.",
          },
  };
};
