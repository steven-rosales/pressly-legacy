import type { Metadata } from 'next';

import {
  DELIVERY_FEE_SHORT_COPY,
  OFFER_COPY,
} from '@/app/shared/marketing/content';
import {
  loadDryCleaningPricingViewModel,
  loadWashFoldPricingViewModel,
  type DryCleaningPricingModel,
  type WashFoldPricingModel,
} from '@/app/shared/marketing/pricing';
import {
  buildBreadcrumbJsonLd,
  buildCityServiceMetadata,
  buildCountyMetadata,
  buildLocationPageJsonLd,
  buildServiceJsonLd,
  buildStateMetadata,
  formatCountyName,
} from '@/app/shared/marketing/seo';

import {
  COUNTIES,
  COUNTY_CITIES,
  LOCATIONS,
  getLocalProof,
  makeTitle,
  resolveCityService,
} from './content';
import type { ServiceType } from './content';
import type { LocalProof } from './content/local-proof';
import type { TitleVersion } from './content/seo-versions';

type LocationServicePanelKind = 'washFold' | 'dryCleaning';

type LocationServicePanel =
  | Readonly<{ service: 'washFold'; pricing: WashFoldPricingModel }>
  | Readonly<{ service: 'dryCleaning'; pricing: DryCleaningPricingModel }>;

type LocationGridItem =
  | Readonly<{ label: string; primaryHref: string; secondaryHref?: undefined }>
  | Readonly<{ label: string; primaryHref: string; secondaryHref: string }>;

export type LocationPageModel = Readonly<{
  jsonLd: readonly Record<string, unknown>[];
  hero: Readonly<{
    image: string;
    heading: string;
    description: string;
    cityName: string;
    offerText: string;
    ctaSource: 'location_hero';
  }>;
  hiw: Readonly<{
    heading: string;
    steps: readonly Readonly<{ title: string; description: string }>[];
  }>;
  servicePanels: readonly LocationServicePanel[];
  serviceSectionClassName: string;
  story: Readonly<{
    title: string;
    heading: string;
    paragraphs: readonly string[];
    heroImage?: string;
    locationLabel: string;
  }>;
  localProof?: LocalProof;
  linksGrid?: Readonly<{
    heading: string;
    items: readonly LocationGridItem[];
  }>;
  testimonialsClassName: string;
  bottom: Readonly<{
    title: string;
    description: string;
  }>;
}>;

const locationServiceSection = 'mx-auto max-w-[1440px] px-4 sm:px-6 lg:py-20';
const stateServiceSection = `${locationServiceSection} py-28`;
const countyServiceSection = `${locationServiceSection} py-20`;
const cityServiceSection = `${locationServiceSection} py-20`;

const serviceLabel = (serviceType: ServiceType) =>
  serviceType === 'dryCleaning' ? 'Dry Cleaning' : 'Wash & Fold';

const serviceNoun = (serviceType: ServiceType) =>
  serviceType === 'dryCleaning' ? 'Delivery Service' : 'Laundry Service';

const asTitleVersion = (value: number | undefined): TitleVersion | undefined =>
  value as TitleVersion | undefined;

const buildCombinedHiwSteps = (
  scope: Readonly<{ state?: string; county?: string }>,
) => [
  {
    title: makeTitle('hiwTitleSchedule', undefined, scope, undefined, 'combined'),
    description: makeTitle(
      'hiwDescriptionSchedule',
      undefined,
      scope,
      undefined,
      'combined',
    ),
  },
  {
    title: makeTitle('hiwTitlePickup', undefined, scope, undefined, 'combined'),
    description: makeTitle(
      'hiwDescriptionPickup',
      undefined,
      scope,
      undefined,
      'combined',
    ),
  },
  {
    title: makeTitle('hiwTitleClean', undefined, scope, undefined, 'combined'),
    description: makeTitle(
      'hiwDescriptionClean',
      undefined,
      scope,
      undefined,
      'combined',
    ),
  },
  {
    title: makeTitle('hiwTitleDeliver', undefined, scope, undefined, 'combined'),
    description: makeTitle(
      'hiwDescriptionDeliver',
      undefined,
      scope,
      undefined,
      'combined',
    ),
  },
] as const;

const buildCityHiwSteps = (
  cityName: string,
  serviceType: ServiceType,
  versions: {
    seoCityHIWTitleSchedule?: number;
    seoCityHIWDescriptionSchedule?: number;
    seoCityHIWTitlePickup?: number;
    seoCityHIWDescriptionPickup?: number;
    seoCityHIWTitleClean?: number;
    seoCityHIWDescriptionClean?: number;
    seoCityHIWTitleDeliver?: number;
    seoCityHIWDescriptionDeliver?: number;
  },
) =>
  [
    ['seoCityHIWTitleSchedule', 'seoCityHIWDescriptionSchedule'],
    ['seoCityHIWTitlePickup', 'seoCityHIWDescriptionPickup'],
    ['seoCityHIWTitleClean', 'seoCityHIWDescriptionClean'],
    ['seoCityHIWTitleDeliver', 'seoCityHIWDescriptionDeliver'],
  ].map(([titleKey, descriptionKey]) => ({
    title: makeTitle(
      titleKey as Parameters<typeof makeTitle>[0],
      asTitleVersion(versions[titleKey as keyof typeof versions]),
      { city: cityName },
      undefined,
      serviceType,
    ),
    description: makeTitle(
      descriptionKey as Parameters<typeof makeTitle>[0],
      asTitleVersion(versions[descriptionKey as keyof typeof versions]),
      { city: cityName },
      undefined,
      serviceType,
    ),
  }));

const toCountyLabel = (county: string) =>
  county
    .replace('-county', '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getLocationServicePanel = async (
  service: LocationServicePanelKind,
): Promise<LocationServicePanel> =>
  service === 'dryCleaning'
    ? {
        service,
        pricing: await loadDryCleaningPricingViewModel(),
      }
    : {
        service,
        pricing: await loadWashFoldPricingViewModel(),
      };

const getLocationServicePanels = (
  services: readonly LocationServicePanelKind[],
): Promise<readonly LocationServicePanel[]> =>
  Promise.all(services.map((service) => getLocationServicePanel(service)));

export const newJerseyMetadata: Metadata = buildStateMetadata();

export const getCountyPageMetadata = (county: string): Metadata =>
  buildCountyMetadata(county);

export const getCityServicePageMetadata = (
  county: string,
  slug: string,
): Metadata | null => {
  const resolved = resolveCityService(county, slug);
  if (!resolved) return null;

  return buildCityServiceMetadata({
    location: resolved.location,
    serviceType: resolved.serviceType,
  });
};

export const getNewJerseyPageModel = async (): Promise<LocationPageModel> => {
  const representative = LOCATIONS[0];
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
      offerText: OFFER_COPY,
      ctaSource: 'location_hero',
    },
    hiw: {
      heading: 'How your laundry and dry cleaning pickup works.',
      steps: buildCombinedHiwSteps({ state: 'New Jersey' }),
    },
    servicePanels: await getLocationServicePanels(['washFold', 'dryCleaning']),
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
    testimonialsClassName:
      'mx-auto max-w-[1440px] px-4 py-28 sm:px-6 lg:py-20',
    bottom: {
      title: 'All your garment care, one warm pickup away.',
      description: `From everyday laundry to pressed dry cleaning, schedule one visit and we'll handle it all with a ${DELIVERY_FEE_SHORT_COPY}, returned fresh, and folded or pressed the way you like.`,
    },
  };
};

export const getCountyPageModel = async (
  countySlug: string,
): Promise<LocationPageModel | null> => {
  const representative = LOCATIONS.find((loc) => loc.county === countySlug);
  if (!representative) return null;

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
      offerText: OFFER_COPY,
      ctaSource: 'location_hero',
    },
    hiw: {
      heading: 'How your laundry and dry cleaning pickup works.',
      steps: buildCombinedHiwSteps({ county: formattedCounty }),
    },
    servicePanels: await getLocationServicePanels(['washFold', 'dryCleaning']),
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
    testimonialsClassName:
      'mx-auto max-w-[1440px] px-4 py-16 sm:px-6 lg:py-20',
    bottom: {
      title: `Laundry and dry cleaning made easy in ${formattedCounty} County`,
      description:
        "Schedule one warm pickup for wash & fold and dry cleaning together. We'll collect everything, clean with care, and deliver it back fresh and ready to wear.",
    },
  };
};

export const getCityServicePageModel = async (
  county: string,
  slug: string,
): Promise<LocationPageModel | null> => {
  const resolved = resolveCityService(county, slug);
  if (!resolved) return null;

  const { location, serviceConfig, serviceType } = resolved;
  const { cityName, heroImage, versions } = location;
  const countyName = formatCountyName(county);
  const proof = getLocalProof(location, serviceType);
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
      }),
    ],
    hero: {
      image: heroImage,
      heading,
      description,
      cityName,
      offerText: OFFER_COPY,
      ctaSource: 'location_hero',
    },
    hiw: {
      heading:
        serviceType === 'dryCleaning'
          ? `How your dry cleaning pickup works in ${cityName}.`
          : `How your laundry pickup works in ${cityName}`,
      steps: buildCityHiwSteps(cityName, serviceType, versions ?? {}),
    },
    servicePanels: await getLocationServicePanels([
      serviceConfig.isDryCleaningService ? 'dryCleaning' : 'washFold',
    ]),
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
    testimonialsClassName:
      'mx-auto max-w-[1440px] px-4 py-28 sm:px-6 lg:py-20',
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
