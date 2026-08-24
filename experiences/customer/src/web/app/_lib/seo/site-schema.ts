import { CONTACT, SITE_URL } from '#customer/config/site';

export type ServiceType = 'washFold' | 'dryCleaning';
export type ServiceSchemaType = ServiceType | 'combined';

export type BreadcrumbItem = Readonly<{
  name: string;
  path: string;
}>;

export type FaqItem = Readonly<{
  question: string;
  answer: string;
}>;

export type SchemaNode = Record<string, unknown>;

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const LOCAL_BUSINESS_ID = `${SITE_URL}/#local-business`;
const WEBSITE_ID = `${SITE_URL}/#website`;
export const SCHEMA_CONTEXT = 'https://schema.org';
export const SCHEMA_STATE_NAME = 'New Jersey';
export const SCHEMA_STATE_CODE = 'NJ';
export const SCHEMA_COUNTRY_CODE = 'US';
export const SCHEMA_OPENING_HOURS = 'Mo-Su 13:00-22:00';

export const OPENING_HOURS_SPECIFICATION = {
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

export function buildCanonical(path: string): string {
  return new URL(path, SITE_URL).toString();
}

export function withoutUndefined<T extends SchemaNode>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

export function buildJsonLdGraph(nodes: SchemaNode[]) {
  return {
    '@context': SCHEMA_CONTEXT,
    '@graph': nodes,
  };
}

export function buildOrderAction() {
  return {
    '@type': 'OrderAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: buildCanonical('/schedule'),
      actionPlatform: ORDER_ACTION_PLATFORMS,
    },
  };
}

export function formatCountyName(countySlug: string): string {
  return countySlug
    .replace('-county', '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

export function buildBreadcrumbNode(items: readonly BreadcrumbItem[]) {
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

export function buildBreadcrumbJsonLd(items: readonly BreadcrumbItem[]) {
  return {
    '@context': SCHEMA_CONTEXT,
    ...buildBreadcrumbNode(items),
  };
}

export function buildFaqNode(faqs: readonly FaqItem[]) {
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

export function buildFaqJsonLd(faqs: readonly FaqItem[]) {
  return {
    '@context': SCHEMA_CONTEXT,
    ...buildFaqNode(faqs),
  };
}
