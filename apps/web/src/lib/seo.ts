import type { Metadata } from 'next';

import { CONTACT, PRICING, SITE_URL, formatUsd } from '@/lib/content';
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

const DEFAULT_IMAGE = '/graphic-img/hero-customer.webp';
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const LOCAL_BUSINESS_ID = `${SITE_URL}/#local-business`;
const WEBSITE_ID = `${SITE_URL}/#website`;

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
    '@context': 'https://schema.org',
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
        parentOrganization: {
          '@id': ORGANIZATION_ID,
        },
        areaServed: SERVICE_AREA_COUNTIES.map((county) => ({
          '@type': 'AdministrativeArea',
          name: `${county}, New Jersey`,
        })),
        openingHoursSpecification: [
          {
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
          },
        ],
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

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: buildCanonical(item.path),
    })),
  };
}

export function buildServiceJsonLd({
  name,
  description,
  path,
  areaName,
  serviceType,
}: {
  name: string;
  description: string;
  path: string;
  areaName: string;
  serviceType: ServiceType | 'combined';
}) {
  const serviceLabel =
    serviceType === 'dryCleaning'
      ? 'Dry cleaning pickup and delivery'
      : serviceType === 'washFold'
        ? 'Wash and fold laundry pickup and delivery'
        : 'Laundry and dry cleaning pickup and delivery';

  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${buildCanonical(path)}#service`,
    name,
    description,
    serviceType: serviceLabel,
    url: buildCanonical(path),
    provider: {
      '@id': LOCAL_BUSINESS_ID,
    },
    areaServed: {
      '@type': 'AdministrativeArea',
      name: areaName,
    },
    offers:
      serviceType === 'washFold'
        ? {
            '@type': 'Offer',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: (PRICING.washFoldPerLbCents / 100).toFixed(2),
              priceCurrency: 'USD',
              unitText: 'pound',
            },
            description: `${formatUsd(PRICING.washFoldPerLbCents)} per pound with a ${formatUsd(PRICING.washFoldMinimumCents)} minimum.`,
          }
        : undefined,
  };
}

export function buildFaqJsonLd(faqs: readonly FaqItem[]) {
  return {
    '@context': 'https://schema.org',
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
