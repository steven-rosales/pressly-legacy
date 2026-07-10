import { buildBreadcrumbJsonLd, buildServiceJsonLd } from '@/app/_lib/seo';
import { ORDER_ENTRY_OFFER_COPY } from '@/features/order-entry/content';
import type { PricingCatalogLoader } from '@/features/pricing/model';

import { COUNTIES, LOCATIONS, makeTitle } from './content';
import {
  buildCombinedHiwSteps,
  getDeliveryFeeShortCopy,
  getLocationServicePanels,
  stateServiceSection,
  toCountyLabel,
  type LocationPageModel,
} from './_shared/model';

export type { LocationPageModel } from './_shared/model';

export const getNewJerseyPageModel = async (
  loadPricing: PricingCatalogLoader,
): Promise<LocationPageModel> => {
  const representative = LOCATIONS[0];
  const servicePanels = await getLocationServicePanels(loadPricing, [
    'washFold',
    'dryCleaning',
  ]);
  const description = makeTitle(
    'seoCityHeroDescription',
    1,
    { state: 'New Jersey' },
    undefined,
    'combined',
  );

  return {
    jsonLd: [
      buildBreadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'New Jersey', path: '/new-jersey' },
      ]),
      buildServiceJsonLd({
        name: 'New Jersey Laundry Service & Dry Cleaning',
        description,
        path: '/new-jersey',
        areaName: 'New Jersey',
        serviceType: 'combined',
      }),
    ],
    hero: {
      image: representative?.heroImage ?? '/images/locations/default.webp',
      heading: 'New Jersey Laundry Service & Dry Cleaning',
      description,
      cityName: 'New Jersey',
      offerText: ORDER_ENTRY_OFFER_COPY,
      ctaSource: 'location_hero',
    },
    hiw: {
      heading: 'How your laundry and dry cleaning pickup works.',
      steps: buildCombinedHiwSteps({ state: 'New Jersey' }),
    },
    servicePanels,
    serviceSectionClassName: stateServiceSection,
    story: {
      title: 'Pressly & New Jersey',
      heading: 'Complete laundry and dry cleaning across New Jersey',
      paragraphs: [
        makeTitle(
          'seoCityDescriptionParagraph1',
          undefined,
          { state: 'New Jersey' },
          undefined,
          'combined',
        ),
        makeTitle(
          'seoCityDescriptionParagraph2',
          undefined,
          { state: 'New Jersey' },
          undefined,
          'combined',
        ),
        makeTitle(
          'seoCityDescriptionParagraph3',
          undefined,
          { state: 'New Jersey' },
          undefined,
          'combined',
        ),
      ],
      ...(representative?.heroImage === undefined
        ? {}
        : { heroImage: representative.heroImage }),
      locationLabel: 'New Jersey',
    },
    linksGrid: {
      heading: 'Service by County',
      items: COUNTIES.map((county) => ({
        label: toCountyLabel(county),
        primaryHref: `/new-jersey/${county}`,
      })),
    },
    testimonialsClassName: 'mx-auto max-w-[1440px] px-4 py-28 sm:px-6 lg:py-20',
    bottom: {
      title: 'All your garment care, one warm pickup away.',
      description: `From everyday laundry to pressed dry cleaning, schedule one visit and we'll handle it all with ${getDeliveryFeeShortCopy(servicePanels)}, returned fresh, and folded or pressed the way you like.`,
    },
  };
};
