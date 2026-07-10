import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { serverPricingCatalogLoader } from '@/features/pricing/server';
import { buildCityServiceParams } from '../../content';
import { LocationPageView } from '../../ui/LocationPageView';
import { getCityServicePageMetadata } from '../../seo';
import { getCityServicePageModel } from './model';

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return buildCityServiceParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ county: string; slug: string }>;
}): Promise<Metadata> {
  const { county, slug } = await params;
  const metadata = getCityServicePageMetadata(county, slug);

  if (metadata === null) notFound();

  return metadata;
}

export default async function CityServicePage({
  params,
}: {
  params: Promise<{ county: string; slug: string }>;
}) {
  const { county, slug } = await params;
  const model =
    county && slug
      ? await getCityServicePageModel(serverPricingCatalogLoader, county, slug)
      : null;
  if (model === null) notFound();

  return <LocationPageView model={model} />;
}
