import type { PricingCatalogResult } from '@pressly/contracts';
import { CONTACT } from '@/config/site';
import {
  buildOfferCatalogId,
  buildServiceNode,
  buildServiceOfferCatalog,
} from './pricing-schema';
import {
  OPENING_HOURS_SPECIFICATION,
  ORGANIZATION_ID,
  SCHEMA_CONTEXT,
  SCHEMA_COUNTRY_CODE,
  SCHEMA_OPENING_HOURS,
  SCHEMA_STATE_CODE,
  SCHEMA_STATE_NAME,
  buildBreadcrumbNode,
  buildCanonical,
  buildFaqNode,
  buildJsonLdGraph,
  buildOrderAction,
  formatCountyName,
  withoutUndefined,
  type BreadcrumbItem,
  type FaqItem,
  type ServiceType,
} from './site-schema';

export type LocationSeoRecord = Readonly<{
  county: string;
  citySlug: string;
  cityName: string;
  zips: readonly string[];
  heroImage: string;
  schemaAddress?: Readonly<{
    streetAddress?: string;
    postalCode?: string;
  }>;
  geo?: Readonly<{ latitude: number; longitude: number }>;
  aggregateRating?: Readonly<{ ratingValue: number; reviewCount: number }>;
}>;

type BuildLocationPageGraphInput = {
  name: string;
  description: string;
  path: string;
  breadcrumbs: BreadcrumbItem[];
  location: LocationSeoRecord;
  serviceType: ServiceType;
  faqs: readonly FaqItem[];
  pricingCatalog?: PricingCatalogResult;
};

function buildLocationAddress(location: LocationSeoRecord) {
  return withoutUndefined({
    '@type': 'PostalAddress',
    streetAddress: location.schemaAddress?.streetAddress,
    addressLocality: location.cityName,
    addressRegion: SCHEMA_STATE_CODE,
    postalCode: location.schemaAddress?.postalCode ?? location.zips[0],
    addressCountry: SCHEMA_COUNTRY_CODE,
  });
}

function buildLocationAreaServed(
  location: LocationSeoRecord,
  countyName: string,
) {
  return {
    '@type': 'City',
    name: location.cityName,
    containedInPlace: {
      '@type': 'AdministrativeArea',
      name: `${countyName} County`,
      containedInPlace: {
        '@type': 'State',
        name: SCHEMA_STATE_NAME,
      },
    },
  };
}

function buildLocationBusinessNode({
  location,
  path,
  name,
  description,
}: {
  location: LocationSeoRecord;
  serviceType: ServiceType;
  path: string;
  name: string;
  description: string;
}) {
  const countyName = formatCountyName(location.county);
  const geo = location.geo
    ? {
        '@type': 'Place',
        geo: {
          '@type': 'GeoCoordinates',
          latitude: location.geo.latitude,
          longitude: location.geo.longitude,
        },
      }
    : undefined;
  const aggregateRating = location.aggregateRating
    ? {
        '@type': 'AggregateRating',
        bestRating: 5,
        worstRating: 1,
        ratingValue: location.aggregateRating.ratingValue,
        reviewCount: location.aggregateRating.reviewCount,
      }
    : undefined;

  return withoutUndefined({
    '@type': 'DryCleaningOrLaundry',
    '@id': buildCanonical(path),
    url: buildCanonical(path),
    name,
    description,
    currenciesAccepted: 'USD',
    paymentAccepted: 'Credit Card, Debit Card',
    priceRange: '$$',
    openingHours: SCHEMA_OPENING_HOURS,
    openingHoursSpecification: [OPENING_HOURS_SPECIFICATION],
    email: CONTACT.email,
    telephone: CONTACT.phone,
    brand: {
      '@type': 'Brand',
      name: 'Pressly',
    },
    parentOrganization: {
      '@id': ORGANIZATION_ID,
    },
    areaServed: buildLocationAreaServed(location, countyName),
    address: buildLocationAddress(location),
    location: geo,
    potentialAction: buildOrderAction(),
    hasOfferCatalog: {
      '@id': buildOfferCatalogId(path),
    },
    aggregateRating,
  });
}

export function buildLocationBusinessJsonLd(input: {
  location: LocationSeoRecord;
  serviceType: ServiceType;
  path: string;
  name: string;
  description: string;
}) {
  return {
    '@context': SCHEMA_CONTEXT,
    ...buildLocationBusinessNode(input),
  };
}

export function buildLocationPageJsonLd({
  location,
  serviceType,
  name,
  description,
  path,
  breadcrumbs,
  faqs,
  pricingCatalog,
}: BuildLocationPageGraphInput) {
  const business = buildLocationBusinessNode({
    location,
    serviceType,
    path,
    name,
    description,
  });
  const catalog = buildServiceOfferCatalog(serviceType, path, pricingCatalog);
  const service = buildServiceNode({
    name,
    description,
    path,
    areaName: `${location.cityName}, ${formatCountyName(location.county)} County, ${SCHEMA_STATE_NAME}`,
    serviceType,
    providerId: business['@id'] as string,
    ...(pricingCatalog === undefined ? {} : { pricingCatalog }),
  });

  return buildJsonLdGraph([
    business,
    service,
    catalog,
    buildBreadcrumbNode(breadcrumbs),
    buildFaqNode(faqs),
  ]);
}
