import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/app/shared/marketing/content';
import {
  COUNTIES,
  buildCityServiceParams,
} from '@/app/(marketing)/new-jersey/content';

const staticRoutes = [
  '',
  '/services-pricing/wash-fold',
  '/services-pricing/dry-cleaning',
  '/commercial',
  '/about',
  '/faqs',
  '/contact',
  '/careers',
  '/new-jersey',
  '/privacy',
  '/terms',
] as const;

const LAST_MODIFIED = new Date('2026-04-26T00:00:00.000Z');

export default function sitemap(): MetadataRoute.Sitemap {
  const countyRoutes = COUNTIES.map((county) => `/new-jersey/${county}`);
  const cityServiceRoutes = buildCityServiceParams().map(
    (params) => `/new-jersey/${params.county}/${params.slug}`,
  );

  return [
    ...staticRoutes.map((route) => ({
      url: `${SITE_URL}${route}`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'weekly' as const,
      priority: route === '' ? 1 : route === '/new-jersey' ? 0.95 : 0.75,
    })),
    ...countyRoutes.map((route) => ({
      url: `${SITE_URL}${route}`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    })),
    ...cityServiceRoutes.map((route) => ({
      url: `${SITE_URL}${route}`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
