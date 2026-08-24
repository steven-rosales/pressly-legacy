import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import type { PricingCatalogLoader } from '#customer/features/pricing/model';
import { COUNTIES } from '../content/county-cities';
import { LocationPageView } from '../ui/LocationPageView';
import { getCountyPageMetadata } from '../seo';
import { getCountyPageModel } from './model';

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

export async function renderCountyPage(
  { params }: { params: Promise<{ county: string }> },
  pricingCatalog: PricingCatalogLoader,
) {
  const { county } = await params;
  const model = county
    ? await getCountyPageModel(pricingCatalog, county)
    : null;
  if (model === null) notFound();

  return <LocationPageView model={model} />;
}
