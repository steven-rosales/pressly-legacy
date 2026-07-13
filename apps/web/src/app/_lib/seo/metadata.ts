import type { Metadata } from 'next';
import { DELIVERY_FEE_SHORT_COPY } from '@/features/pricing/presenter';
import type { LocationSeoRecord } from './location-schema';
import {
  buildCanonical,
  formatCountyName,
  type ServiceType,
} from './site-schema';

type BuildPageMetadataInput = {
  title: string;
  description: string;
  path: string;
  image?: string;
  robots?: Metadata['robots'];
};

const DEFAULT_IMAGE = '/graphic-img/hero-customer.webp';

export const NOINDEX_ROBOTS = {
  index: false,
  follow: false,
} satisfies Metadata['robots'];

export function buildPageMetadata({
  title,
  description,
  path,
  image = DEFAULT_IMAGE,
  robots,
}: BuildPageMetadataInput): Metadata {
  const canonical = buildCanonical(path);
  const imageUrl = buildCanonical(image);

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: 'website',
      siteName: 'Pressly',
      title,
      description,
      url: canonical,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${title} from Pressly`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
    robots,
  };
}

export function buildStateMetadata(): Metadata {
  return buildPageMetadata({
    title: 'New Jersey Laundry Service & Dry Cleaning',
    description: `Schedule laundry and dry cleaning pickup and delivery across Pressly service areas in New Jersey. Clear pricing with ${DELIVERY_FEE_SHORT_COPY}.`,
    path: '/new-jersey',
  });
}

export function buildCountyMetadata(countySlug: string): Metadata {
  const countyName = formatCountyName(countySlug);

  return buildPageMetadata({
    title: `${countyName} County Laundry & Dry Cleaning Pickup`,
    description: `Schedule wash and fold laundry and dry cleaning pickup in ${countyName} County, NJ. Pressly offers transparent pricing, online scheduling, and ${DELIVERY_FEE_SHORT_COPY}.`,
    path: `/new-jersey/${countySlug}`,
  });
}

export function buildCityServiceMetadata({
  location,
  serviceType,
}: {
  location: LocationSeoRecord;
  serviceType: ServiceType;
}): Metadata {
  const isDryCleaning = serviceType === 'dryCleaning';
  const title = isDryCleaning
    ? `${location.cityName}, NJ Dry Cleaners Pickup & Delivery`
    : `${location.cityName}, NJ Wash & Fold Laundry Pickup & Delivery`;
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
    description: `Schedule ${service} in ${location.cityName}, NJ. Clear pricing, ${DELIVERY_FEE_SHORT_COPY}, and online ordering through Pressly.${zipText}`,
    path: `/new-jersey/${location.county}/${slug}`,
    image: location.heroImage,
  });
}
