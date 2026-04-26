import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/content';
import {
  COUNTIES,
  buildCityServiceParams,
} from '@/routes/shared/marketing/public';

const staticRoutes = [
  '',
  '/services-pricing',
  '/services-pricing/wash-fold',
  '/services-pricing/dry-cleaning',
  '/commercial',
  '/new-jersey',
  '/privacy',
  '/terms',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const countyRoutes = COUNTIES.map((county) => `/new-jersey/${county}`);
  const cityServiceRoutes = buildCityServiceParams().map(
    (params) => `/new-jersey/${params.county}/${params.slug}`,
  );

  return [...staticRoutes, ...countyRoutes, ...cityServiceRoutes].map(
    (route) => ({
      url: `${SITE_URL}${route}`,
    }),
  );
}
