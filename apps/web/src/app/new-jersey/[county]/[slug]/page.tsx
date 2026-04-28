import type { Metadata } from 'next';
import CityServiceRoute, {
  generateStaticParams as generateCityServiceStaticParams,
} from '@/routes/new-jersey/city-service/route';
import {
  buildCityServiceMetadata,
  NOINDEX_ROBOTS,
} from '@/routes/shared/marketing/seo';
import { resolveCityService } from '@/routes/new-jersey/content';

export const revalidate = 3600;
export const dynamicParams = false;
export const generateStaticParams = generateCityServiceStaticParams;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ county: string; slug: string }>;
}): Promise<Metadata> {
  const { county, slug } = await params;
  const resolved = resolveCityService(county, slug);

  if (!resolved) {
    return {
      title: 'Service Area Not Found',
      robots: NOINDEX_ROBOTS,
    };
  }

  return buildCityServiceMetadata({
    location: resolved.location,
    serviceType: resolved.serviceType,
  });
}

export default CityServiceRoute;
