import {
  CONTACT,
  DELIVERY_FEE_COPY,
  PRICING,
  formatUsd,
} from '@/app/shared/marketing/content';

import type { LocationRecord } from './locations';
import { COUNTY_CITIES } from './county-cities';
import type { ServiceType } from './service-configs';

export type LocalProofFaq = {
  question: string;
  answer: string;
};

export type LocalProofLink = {
  label: string;
  href: string;
};

export type LocalProof = {
  cityName: string;
  countyName: string;
  serviceLabel: string;
  zips: string[];
  neighborhoods: string[];
  notes: string[];
  faqs: LocalProofFaq[];
  siblingServiceLink: LocalProofLink;
  countyLink: LocalProofLink;
  pricingLink: LocalProofLink;
  nearbyLinks: LocalProofLink[];
};

const PRIORITY_CITY_NEIGHBORHOODS: Record<string, string[]> = {
  'jersey-city': [
    'Downtown Jersey City',
    'Journal Square',
    'The Heights',
    'Newport',
    'Paulus Hook',
  ],
  hoboken: [
    'Downtown Hoboken',
    'Uptown Hoboken',
    'Waterfront',
    'Southwest Hoboken',
  ],
  newark: ['Ironbound', 'Downtown Newark', 'University Heights', 'Forest Hill'],
  montclair: [
    'Upper Montclair',
    'Watchung Plaza',
    'Walnut Street',
    'South End',
  ],
  clifton: ['Botany Village', 'Athenia', 'Allwood', 'Richfield'],
  paterson: ['Downtown Paterson', 'Eastside', 'Hillcrest', 'South Paterson'],
  hackensack: [
    'Downtown Hackensack',
    'Fairmount',
    'Anderson Street',
    'Prospect Avenue',
  ],
  'fort-lee': [
    'Palisade Avenue',
    'Linwood Park',
    'Coytesville',
    'Bridge Plaza',
  ],
  teaneck: ['Cedar Lane', 'West Englewood', 'Queen Anne Road', 'Teaneck Road'],
  paramus: ['Arcola', 'Farview', 'Ridge Ranch', 'Paramus Park area'],
  bayonne: [
    'Bergen Point',
    'Constable Hook',
    'Broadway',
    'Bayonne Bridge area',
  ],
  'union-city': [
    'Bergenline Avenue',
    'Summit Avenue',
    'West Hoboken',
    'Monastery Place',
  ],
  bloomfield: ['Brookdale', 'Watsessing', 'Oak View', 'Bloomfield Center'],
  'west-orange': [
    'Pleasantdale',
    'Gregory',
    'St. Cloud',
    'Llewellyn Park area',
  ],
  morristown: [
    'Morristown Green',
    'Speedwell',
    'Washington Street',
    'Convent Station',
  ],
  elizabeth: ['Elmora', 'Midtown Elizabeth', 'Peterstown', 'Port Elizabeth'],
};

function formatCountyName(countySlug: string) {
  return countySlug
    .replace('-county', '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getServiceLabel(serviceType: ServiceType) {
  return serviceType === 'dryCleaning'
    ? 'dry cleaning pickup and delivery'
    : 'wash and fold laundry pickup and delivery';
}

function getSiblingServiceLink(
  location: LocationRecord,
  serviceType: ServiceType,
): LocalProofLink {
  const siblingSlug =
    serviceType === 'dryCleaning'
      ? `laundry-service-in-${location.citySlug}`
      : `dry-cleaners-in-${location.citySlug}`;

  return {
    label:
      serviceType === 'dryCleaning'
        ? `Wash & fold laundry in ${location.cityName}`
        : `Dry cleaning in ${location.cityName}`,
    href: `/new-jersey/${location.county}/${siblingSlug}`,
  };
}

function getNearbyLinks(location: LocationRecord, serviceType: ServiceType) {
  const prefix =
    serviceType === 'dryCleaning' ? 'dry-cleaners-in-' : 'laundry-service-in-';

  return (COUNTY_CITIES[location.county] ?? [])
    .filter((city) => city.slug !== location.citySlug)
    .slice(0, 6)
    .map((city) => ({
      label: city.name,
      href: `/new-jersey/${location.county}/${prefix}${city.slug}`,
    }));
}

export function getLocalProof(
  location: LocationRecord,
  serviceType: ServiceType,
): LocalProof {
  const serviceLabel = getServiceLabel(serviceType);
  const countyName = formatCountyName(location.county);
  const zipText =
    location.zips.length > 0
      ? location.zips.join(', ')
      : `${location.cityName} service areas`;
  const isDryCleaning = serviceType === 'dryCleaning';
  const minimum = isDryCleaning
    ? formatUsd(PRICING.dryCleaningMinimumCents)
    : formatUsd(PRICING.washFoldMinimumCents);

  const faqs = [
    {
      question: `Does Pressly offer ${serviceLabel} in ${location.cityName}?`,
      answer: `Yes. Pressly offers ${serviceLabel} across ${location.cityName}, with online scheduling and delivery back to your door. ${DELIVERY_FEE_COPY}`,
    },
    {
      question: `Which ZIP codes do you serve in ${location.cityName}?`,
      answer: `Pressly serves ${location.cityName} ZIP codes including ${zipText}.`,
    },
    {
      question: isDryCleaning
        ? `Can I add wash and fold laundry to a ${location.cityName} dry cleaning pickup?`
        : `Can I add dry cleaning to a ${location.cityName} laundry pickup?`,
      answer: `Yes. You can add wash and fold and dry cleaning to the same pickup when placing your order.`,
    },
    {
      question: `How should I prepare my ${location.cityName} pickup?`,
      answer: `Place your items in any bag you have available. If you are sending both laundry and dry cleaning, separate those items when possible so pickup is straightforward.`,
    },
  ];

  return {
    cityName: location.cityName,
    countyName,
    serviceLabel,
    zips: location.zips,
    neighborhoods: PRIORITY_CITY_NEIGHBORHOODS[location.citySlug] ?? [],
    notes: [
      `Service area: ${location.cityName}, ${countyName} County, including ${zipText}.`,
      `Ordering is available online any time; available pickup windows are shown before checkout.`,
      `Customer care is available daily from 1pm to 10pm at ${CONTACT.phone}.`,
      isDryCleaning
        ? `Dry cleaning is priced per item with a ${minimum} minimum.`
        : `Wash and fold is ${formatUsd(PRICING.washFoldPerLbCents)} per pound with a ${minimum} minimum.`,
    ],
    faqs,
    siblingServiceLink: getSiblingServiceLink(location, serviceType),
    countyLink: {
      label: `${countyName} County service area`,
      href: `/new-jersey/${location.county}`,
    },
    pricingLink: {
      label: isDryCleaning ? 'Dry cleaning pricing' : 'Wash & fold pricing',
      href: isDryCleaning
        ? '/services-pricing/dry-cleaning'
        : '/services-pricing/wash-fold',
    },
    nearbyLinks: getNearbyLinks(location, serviceType),
  };
}
