import type {
  DryCleaningPricingModel,
  PricingCatalogLoader,
  PricingCatalogViewModel,
  WashFoldPricingModel,
} from '@/features/pricing/model';
import {
  DELIVERY_FEE_SHORT_COPY,
  toDryCleaningPricingModel,
  toWashFoldPricingModel,
} from '@/features/pricing/presenter';

import { makeTitle } from '../content';
import type { ServiceType } from '../content';
import type { LocalProof } from '../content/local-proof';
import type { TitleVersion } from '../content/seo-versions';

export type LocationServicePanelKind = 'washFold' | 'dryCleaning';

export type LocationServicePanel =
  | Readonly<{
      service: 'washFold';
      catalog: PricingCatalogViewModel['catalog'];
      pricing: WashFoldPricingModel;
    }>
  | Readonly<{
      service: 'dryCleaning';
      catalog: PricingCatalogViewModel['catalog'];
      pricing: DryCleaningPricingModel;
    }>;

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
export const stateServiceSection = `${locationServiceSection} py-28`;
export const countyServiceSection = `${locationServiceSection} py-20`;
export const cityServiceSection = `${locationServiceSection} py-20`;

export const serviceLabel = (serviceType: ServiceType) =>
  serviceType === 'dryCleaning' ? 'Dry Cleaning' : 'Wash & Fold';

export const serviceNoun = (serviceType: ServiceType) =>
  serviceType === 'dryCleaning' ? 'Delivery Service' : 'Laundry Service';

const asTitleVersion = (value: number | undefined): TitleVersion | undefined =>
  value as TitleVersion | undefined;

export const buildCombinedHiwSteps = (
  scope: Readonly<{ state?: string; county?: string }>,
) =>
  [
    {
      title: makeTitle(
        'hiwTitleSchedule',
        undefined,
        scope,
        undefined,
        'combined',
      ),
      description: makeTitle(
        'hiwDescriptionSchedule',
        undefined,
        scope,
        undefined,
        'combined',
      ),
    },
    {
      title: makeTitle(
        'hiwTitlePickup',
        undefined,
        scope,
        undefined,
        'combined',
      ),
      description: makeTitle(
        'hiwDescriptionPickup',
        undefined,
        scope,
        undefined,
        'combined',
      ),
    },
    {
      title: makeTitle(
        'hiwTitleClean',
        undefined,
        scope,
        undefined,
        'combined',
      ),
      description: makeTitle(
        'hiwDescriptionClean',
        undefined,
        scope,
        undefined,
        'combined',
      ),
    },
    {
      title: makeTitle(
        'hiwTitleDeliver',
        undefined,
        scope,
        undefined,
        'combined',
      ),
      description: makeTitle(
        'hiwDescriptionDeliver',
        undefined,
        scope,
        undefined,
        'combined',
      ),
    },
  ] as const;

export const buildCityHiwSteps = (
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

export const toCountyLabel = (county: string) =>
  county
    .replace('-county', '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const getLocationServicePanel = async (
  loadPricing: PricingCatalogLoader,
  service: LocationServicePanelKind,
): Promise<LocationServicePanel> => {
  const catalog = await loadPricing({
    serviceSlug: service === 'dryCleaning' ? 'dry-cleaning' : 'wash-fold',
  });

  return service === 'dryCleaning'
    ? {
        service,
        catalog: catalog.catalog,
        pricing: toDryCleaningPricingModel(catalog.catalog),
      }
    : {
        service,
        catalog: catalog.catalog,
        pricing: toWashFoldPricingModel(catalog.catalog),
      };
};

export const getLocationServicePanels = (
  loadPricing: PricingCatalogLoader,
  services: readonly LocationServicePanelKind[],
): Promise<readonly LocationServicePanel[]> =>
  Promise.all(
    services.map((service) => getLocationServicePanel(loadPricing, service)),
  );

export const getDeliveryFeeShortCopy = (
  panels: readonly LocationServicePanel[],
): string =>
  panels[0]?.pricing.deliveryFee.shortCopy ?? DELIVERY_FEE_SHORT_COPY;
