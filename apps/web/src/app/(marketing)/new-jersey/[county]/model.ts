import {
  buildBreadcrumbJsonLd,
  buildServiceJsonLd,
  formatCountyName,
} from '@/app/_lib/seo';
import { ORDER_ENTRY_OFFER_COPY } from '@/features/order-entry/content';
import type { PricingCatalogLoader } from '@/features/pricing/model';

import { COUNTY_CITIES, LOCATIONS, makeTitle } from '../content';
import {
  buildCombinedHiwSteps,
  countyServiceSection,
  getLocationServicePanels,
  type LocationPageModel,
} from '../_shared/model';

export const getCountyPageModel = async (
  loadPricing: PricingCatalogLoader,
  countySlug: string,
): Promise<LocationPageModel | null> => {
  const representative = LOCATIONS.find((loc) => loc.county === countySlug);
  if (representative === undefined) return null;

  const formattedCounty = formatCountyName(countySlug);
  const description = makeTitle(
    'seoCityHeroDescription',
    representative.versions?.seoCityHeroDescription ?? 1,
    { county: formattedCounty },
    undefined,
    'combined',
  );

  return {
    jsonLd: [
      buildBreadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'New Jersey', path: '/new-jersey' },
        {
          name: `${formattedCounty} County`,
          path: `/new-jersey/${countySlug}`,
        },
      ]),
      buildServiceJsonLd({
        name: `${formattedCounty} County Laundry Service & Dry Cleaning`,
        description,
        path: `/new-jersey/${countySlug}`,
        areaName: `${formattedCounty} County, New Jersey`,
        serviceType: 'combined',
      }),
    ],
    hero: {
      image: representative.heroImage,
      heading: `${formattedCounty} County Laundry Service & Dry Cleaning`,
      description,
      cityName: formattedCounty,
      offerText: ORDER_ENTRY_OFFER_COPY,
      ctaSource: 'location_hero',
    },
    hiw: {
      heading: 'How your laundry and dry cleaning pickup works.',
      steps: buildCombinedHiwSteps({ county: formattedCounty }),
    },
    servicePanels: await getLocationServicePanels(loadPricing, [
      'washFold',
      'dryCleaning',
    ]),
    serviceSectionClassName: countyServiceSection,
    story: {
      title: `Pressly & ${formattedCounty}`,
      heading: `${formattedCounty} County laundry & dry cleaning`,
      paragraphs: [
        makeTitle(
          'seoCityDescriptionParagraph1',
          undefined,
          { county: formattedCounty },
          undefined,
          'combined',
        ),
        makeTitle(
          'seoCityDescriptionParagraph2',
          undefined,
          { county: formattedCounty },
          undefined,
          'combined',
        ),
        makeTitle(
          'seoCityDescriptionParagraph3',
          undefined,
          { county: formattedCounty },
          undefined,
          'combined',
        ),
      ],
      heroImage: representative.heroImage,
      locationLabel: formattedCounty,
    },
    linksGrid: {
      heading: `Neighborhoods we serve in ${formattedCounty} County`,
      items: (COUNTY_CITIES[countySlug] ?? []).map((city) => ({
        label: city.name,
        primaryHref: `/new-jersey/${countySlug}/laundry-service-in-${city.slug}`,
        secondaryHref: `/new-jersey/${countySlug}/dry-cleaners-in-${city.slug}`,
      })),
    },
    testimonialsClassName: 'mx-auto max-w-[1440px] px-4 py-16 sm:px-6 lg:py-20',
    bottom: {
      title: `Laundry and dry cleaning made easy in ${formattedCounty} County`,
      description:
        "Schedule one warm pickup for wash & fold and dry cleaning together. We'll collect everything, clean with care, and deliver it back fresh and ready to wear.",
    },
  };
};
