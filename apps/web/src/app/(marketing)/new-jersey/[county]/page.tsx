import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { serverPricingCatalogLoader } from '@/features/pricing/server';
import { COUNTIES } from '../content';
import { LocationPageView } from '../ui/LocationPageView';
import { getCountyPageMetadata } from '../seo';
import { getCountyPageModel } from './model';

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return COUNTIES.map((county) => ({ county }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ county: string }>;
}): Promise<Metadata> {
  const { county } = await params;
  return getCountyPageMetadata(county);
}

export default async function CountyPage({
  params,
}: {
  params: Promise<{ county: string }>;
}) {
  const { county } = await params;
  const model = county
    ? await getCountyPageModel(serverPricingCatalogLoader, county)
    : null;
  if (model === null) notFound();

  return <LocationPageView model={model} />;
}
