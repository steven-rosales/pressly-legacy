import type { Metadata } from 'next';

import {
  CONTACT,
  DRY_CLEANING_PRICING,
  PRICING,
  SITE_URL,
  WASH_FOLD_SPECIALTY_ITEMS,
  formatUsd,
} from '@/lib/content';
import type { LocationRecord } from '@/routes/shared/marketing/content/locations';
import type { ServiceType } from '@/routes/shared/marketing/content/service-configs';

type BuildPageMetadataInput = {
  title: string;
  description: string;
  path: string;
  image?: string;
  robots?: Metadata['robots'];
};

type BreadcrumbItem = {
  name: string;
  path: string;
};

type FaqItem = {
  question: string;
  answer: string;
};

type SchemaNode = Record<string, unknown>;
type ServiceSchemaType = ServiceType | 'combined';

type BuildServiceSchemaInput = {
  name: string;
  description: string;
  path: string;
  areaName: string;
  serviceType: ServiceSchemaType;
  providerId?: string;
  includeOfferCatalog?: boolean;
};

type BuildPageGraphInput = {
  name: string;
  description: string;
  path: string;
  breadcrumbs: BreadcrumbItem[];
};

type BuildLocationPageGraphInput = BuildPageGraphInput & {
  location: LocationRecord;
  serviceType: ServiceType;
  faqs: readonly FaqItem[];
};

type BuildServicePricingPageGraphInput = BuildPageGraphInput & {
  areaName: string;
  serviceType: ServiceType;
};

const DEFAULT_IMAGE = '/graphic-img/hero-customer.webp';
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const LOCAL_BUSINESS_ID = `${SITE_URL}/#local-business`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const SCHEMA_CONTEXT = 'https://schema.org';
const SCHEMA_STATE_NAME = 'New Jersey';
const SCHEMA_STATE_CODE = 'NJ';
const SCHEMA_COUNTRY_CODE = 'US';
const SCHEMA_OPENING_HOURS = 'Mo-Su 13:00-22:00';
const OPENING_HOURS_SPECIFICATION = {
  '@type': 'OpeningHoursSpecification',
  dayOfWeek: [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ],
  opens: '13:00',
  closes: '22:00',
} as const;
const ORDER_ACTION_PLATFORMS = [
  'http://schema.org/DesktopWebPlatform',
  'http://schema.org/IOSPlatform',
  'http://schema.org/AndroidPlatform',
] as const;

const SERVICE_AREA_COUNTIES = [
  'Bergen County',
  'Essex County',
  'Hudson County',
  'Morris County',
  'Passaic County',
  'Union County',
] as const;

export const NOINDEX_ROBOTS = {
  index: false,
  follow: false,
} satisfies Metadata['robots'];

export function buildCanonical(path: string) {
  return new URL(path, SITE_URL).toString();
}

function centsToSchemaPrice(cents: number) {
  return (cents / 100).toFixed(2);
}

function priceTextToSchemaPrice(price: string) {
  return price.match(/\$([0-9]+(?:\.[0-9]+)?)/)?.[1] ?? price;
}

function unitTextFromPriceText(price: string) {
  if (/sq\s*ft|sqft|square/i.test(price)) return 'square foot';
  if (/\blb\b|pound/i.test(price)) return 'pound';
  return 'item';
}

function withoutUndefined<T extends SchemaNode>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function buildJsonLdGraph(nodes: SchemaNode[]) {
  return {
    '@context': SCHEMA_CONTEXT,
    '@graph': nodes,
  };
}

function buildOrderAction() {
  return {
    '@type': 'OrderAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: buildCanonical('/schedule'),
      actionPlatform: ORDER_ACTION_PLATFORMS,
    },
  };
}

export function formatCountyName(countySlug: string) {
  return countySlug
    .replace('-county', '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function buildPageMetadata({
  title,
  description,
  path,
  image = DEFAULT_IMAGE,
  robots,
}: BuildPageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: 'website',
      siteName: 'Pressly',
      title,
      description,
      url: path,
      images: [
        {
          url: image,
          alt: `${title} from Pressly`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
    robots,
  };
}

export function buildStateMetadata(): Metadata {
  return buildPageMetadata({
    title: 'New Jersey Laundry Service & Dry Cleaning',
    description:
      'Schedule laundry and dry cleaning pickup and delivery across Pressly service areas in New Jersey. Free pickup and delivery with clear pricing.',
    path: '/new-jersey',
  });
}

export function buildCountyMetadata(countySlug: string): Metadata {
  const countyName = formatCountyName(countySlug);

  return buildPageMetadata({
    title: `${countyName} County Laundry & Dry Cleaning Pickup`,
    description: `Schedule wash and fold laundry and dry cleaning pickup in ${countyName} County, NJ. Pressly offers free pickup and delivery, transparent pricing, and online scheduling.`,
    path: `/new-jersey/${countySlug}`,
  });
}

export function buildCityServiceMetadata({
  location,
  serviceType,
}: {
  location: LocationRecord;
  serviceType: ServiceType;
}): Metadata {
  const isDryCleaning = serviceType === 'dryCleaning';
  const title = isDryCleaning
    ? `${location.cityName} Dry Cleaners Pickup & Delivery`
    : `${location.cityName} Wash & Fold Laundry Pickup`;
  const service = isDryCleaning
    ? 'dry cleaning pickup and delivery'
    : 'wash and fold laundry pickup and delivery';
  const zipText =
    location.zips.length > 0
      ? ` ZIP codes include ${location.zips.join(', ')}.`
      : '';
  const slug = isDryCleaning
    ? `dry-cleaners-in-${location.citySlug}`
    : `laundry-service-in-${location.citySlug}`;

  return buildPageMetadata({
    title,
    description: `Schedule ${service} in ${location.cityName}, NJ. Free pickup and delivery, clear pricing, and online ordering through Pressly.${zipText}`,
    path: `/new-jersey/${location.county}/${slug}`,
    image: location.heroImage,
  });
}

export function buildOrganizationJsonLd() {
  return {
    '@context': SCHEMA_CONTEXT,
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        name: 'Pressly',
        url: SITE_URL,
        logo: buildCanonical('/logo/nav-bar-logo.png'),
        contactPoint: [
          {
            '@type': 'ContactPoint',
            telephone: CONTACT.phone,
            contactType: 'customer care',
            email: CONTACT.email,
            areaServed: 'US-NJ',
            availableLanguage: 'English',
          },
        ],
      },
      {
        '@type': 'LocalBusiness',
        '@id': LOCAL_BUSINESS_ID,
        name: 'Pressly',
        url: SITE_URL,
        telephone: CONTACT.phone,
        email: CONTACT.email,
        priceRange: '$$',
        currenciesAccepted: 'USD',
        paymentAccepted: 'Credit Card, Debit Card',
        parentOrganization: {
          '@id': ORGANIZATION_ID,
        },
        areaServed: SERVICE_AREA_COUNTIES.map((county) => ({
          '@type': 'AdministrativeArea',
          name: `${county}, New Jersey`,
        })),
        openingHours: SCHEMA_OPENING_HOURS,
        openingHoursSpecification: [OPENING_HOURS_SPECIFICATION],
      },
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        name: 'Pressly',
        url: SITE_URL,
        publisher: {
          '@id': ORGANIZATION_ID,
        },
      },
    ],
  };
}

function buildBreadcrumbNode(items: BreadcrumbItem[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: buildCanonical(item.path),
    })),
  };
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': SCHEMA_CONTEXT,
    ...buildBreadcrumbNode(items),
  };
}

function buildOfferCatalogId(path: string) {
  return `${buildCanonical(path)}#offer-catalog`;
}

function buildServiceId(path: string) {
  return `${buildCanonical(path)}#service`;
}

function buildSchemaOffer({
  name,
  price,
  unitText,
  description,
}: {
  name: string;
  price: string;
  unitText?: string | undefined;
  description?: string | undefined;
}) {
  const priceSpecification = withoutUndefined({
    '@type': unitText ? 'UnitPriceSpecification' : 'PriceSpecification',
    price,
    priceCurrency: 'USD',
    unitText,
  });

  return withoutUndefined({
    '@type': 'Offer',
    name,
    description,
    price,
    priceCurrency: 'USD',
    priceSpecification,
    itemOffered: {
      '@type': 'Service',
      name,
    },
  });
}

function buildCentsOffer({
  name,
  priceCents,
  unitText,
  description,
}: {
  name: string;
  priceCents: number;
  unitText?: string | undefined;
  description?: string | undefined;
}) {
  return buildSchemaOffer({
    name,
    price: centsToSchemaPrice(priceCents),
    unitText,
    description,
  });
}

function buildPriceTextOffer({
  name,
  price,
  description,
}: {
  name: string;
  price: string;
  description?: string | undefined;
}) {
  return buildSchemaOffer({
    name,
    price: priceTextToSchemaPrice(price),
    unitText: unitTextFromPriceText(price),
    description: description ?? price,
  });
}

function buildWashFoldOfferCatalog(path: string) {
  return {
    '@type': 'OfferCatalog',
    '@id': buildOfferCatalogId(path),
    name: 'Wash & Fold Pricing',
    itemListElement: [
      buildCentsOffer({
        name: 'Wash & Fold Laundry',
        priceCents: PRICING.washFoldPerLbCents,
        unitText: 'pound',
        description: `${formatUsd(PRICING.washFoldPerLbCents)} per pound with a ${formatUsd(PRICING.washFoldMinimumCents)} minimum.`,
      }),
      buildCentsOffer({
        name: 'Wash & Fold Minimum',
        priceCents: PRICING.washFoldMinimumCents,
        description: `Minimum order for wash and fold laundry is ${formatUsd(PRICING.washFoldMinimumCents)}.`,
      }),
      buildCentsOffer({
        name: 'Hang Dry',
        priceCents: PRICING.hangDryCents,
        unitText: 'item',
        description: `${formatUsd(PRICING.hangDryCents)} per item.`,
      }),
      ...WASH_FOLD_SPECIALTY_ITEMS.map((item) =>
        buildPriceTextOffer({
          name: item.name,
          price: item.price,
          description: `${item.name} is individually priced at ${item.price}.`,
        }),
      ),
    ],
  };
}

function buildDryCleaningOfferCatalog(path: string) {
  return {
    '@type': 'OfferCatalog',
    '@id': buildOfferCatalogId(path),
    name: 'Dry Cleaning Pricing',
    itemListElement: [
      buildCentsOffer({
        name: 'Dry Cleaning Minimum',
        priceCents: PRICING.dryCleaningMinimumCents,
        description: `Minimum dry cleaning order is ${formatUsd(PRICING.dryCleaningMinimumCents)}.`,
      }),
      buildCentsOffer({
        name: 'Launder & Press',
        priceCents: PRICING.launderPressCents,
        unitText: 'item',
        description: `${formatUsd(PRICING.launderPressCents)} per item.`,
      }),
      ...DRY_CLEANING_PRICING.map((category) => ({
        '@type': 'OfferCatalog',
        name: category.title,
        itemListElement: category.items.map((item) =>
          buildPriceTextOffer({
            name: item.name,
            price: item.price,
            description: `${item.name} dry cleaning is priced at ${item.price}.`,
          }),
        ),
      })),
    ],
  };
}

export function buildServiceOfferCatalog(
  serviceType: ServiceType,
  path = serviceType === 'dryCleaning'
    ? '/services-pricing/dry-cleaning'
    : '/services-pricing/wash-fold',
) {
  return serviceType === 'dryCleaning'
    ? buildDryCleaningOfferCatalog(path)
    : buildWashFoldOfferCatalog(path);
}

function getServiceLabel(serviceType: ServiceSchemaType) {
  if (serviceType === 'dryCleaning') return 'Dry cleaning service';
  if (serviceType === 'washFold') return 'Laundry service';
  return 'Laundry and dry cleaning service';
}

function buildAreaServed(areaName: string) {
  return {
    '@type': 'AdministrativeArea',
    name: areaName,
  };
}

function buildServiceNode({
  name,
  description,
  path,
  areaName,
  serviceType,
  providerId = LOCAL_BUSINESS_ID,
  includeOfferCatalog = serviceType !== 'combined',
}: BuildServiceSchemaInput) {
  const catalog =
    includeOfferCatalog && serviceType !== 'combined'
      ? buildServiceOfferCatalog(serviceType, path)
      : undefined;

  return withoutUndefined({
    '@type': 'Service',
    '@id': buildServiceId(path),
    name,
    description,
    serviceType: getServiceLabel(serviceType),
    url: buildCanonical(path),
    provider: {
      '@id': providerId,
    },
    brand: {
      '@type': 'Brand',
      name: 'Pressly',
    },
    areaServed: buildAreaServed(areaName),
    hoursAvailable: [OPENING_HOURS_SPECIFICATION],
    potentialAction: buildOrderAction(),
    hasOfferCatalog: catalog ? { '@id': catalog['@id'] } : undefined,
    offers:
      serviceType === 'washFold'
        ? buildCentsOffer({
            name: 'Wash & Fold Laundry',
            priceCents: PRICING.washFoldPerLbCents,
            unitText: 'pound',
            description: `${formatUsd(PRICING.washFoldPerLbCents)} per pound with a ${formatUsd(PRICING.washFoldMinimumCents)} minimum.`,
          })
        : serviceType === 'dryCleaning'
          ? buildCentsOffer({
              name: 'Dry Cleaning Minimum',
              priceCents: PRICING.dryCleaningMinimumCents,
              description: `Dry cleaning is priced per item with a ${formatUsd(PRICING.dryCleaningMinimumCents)} minimum.`,
            })
          : undefined,
  });
}

export function buildServiceJsonLd(input: BuildServiceSchemaInput) {
  const service = buildServiceNode(input);
  const catalog =
    input.includeOfferCatalog !== false && input.serviceType !== 'combined'
      ? buildServiceOfferCatalog(input.serviceType, input.path)
      : undefined;

  if (catalog) {
    return buildJsonLdGraph([service, catalog]);
  }

  return {
    '@context': SCHEMA_CONTEXT,
    ...service,
  };
}

function buildLocationAddress(location: LocationRecord) {
  return withoutUndefined({
    '@type': 'PostalAddress',
    streetAddress: location.schemaAddress?.streetAddress,
    addressLocality: location.cityName,
    addressRegion: SCHEMA_STATE_CODE,
    postalCode: location.schemaAddress?.postalCode ?? location.zips[0],
    addressCountry: SCHEMA_COUNTRY_CODE,
  });
}

function buildLocationAreaServed(location: LocationRecord, countyName: string) {
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
  location: LocationRecord;
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
  location: LocationRecord;
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

function buildFaqNode(faqs: readonly FaqItem[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
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
}: BuildLocationPageGraphInput) {
  const business = buildLocationBusinessNode({
    location,
    serviceType,
    path,
    name,
    description,
  });
  const catalog = buildServiceOfferCatalog(serviceType, path);
  const service = buildServiceNode({
    name,
    description,
    path,
    areaName: `${location.cityName}, ${formatCountyName(location.county)} County, ${SCHEMA_STATE_NAME}`,
    serviceType,
    providerId: business['@id'] as string,
  });

  return buildJsonLdGraph([
    business,
    service,
    catalog,
    buildBreadcrumbNode(breadcrumbs),
    buildFaqNode(faqs),
  ]);
}

export function buildServicePricingPageJsonLd({
  serviceType,
  name,
  description,
  path,
  areaName,
  breadcrumbs,
}: BuildServicePricingPageGraphInput) {
  const service = buildServiceNode({
    name,
    description,
    path,
    areaName,
    serviceType,
  });
  const catalog = buildServiceOfferCatalog(serviceType, path);

  return buildJsonLdGraph([service, catalog, buildBreadcrumbNode(breadcrumbs)]);
}

export function buildFaqJsonLd(faqs: readonly FaqItem[]) {
  return {
    '@context': SCHEMA_CONTEXT,
    ...buildFaqNode(faqs),
  };
}
