import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import type { PricingCatalogLoader } from '#customer/features/pricing/model';
import { buildCityServiceParams } from '../../content/helpers';
import { LocationPageView } from '../../ui/LocationPageView';
import { getCityServicePageMetadata } from '../../seo';
import { getCityServicePageModel } from './model';

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

export async function renderCityServicePage(
  { params }: { params: Promise<{ county: string; slug: string }> },
  pricingCatalog: PricingCatalogLoader,
) {
  const { county, slug } = await params;
  const model =
    county && slug
      ? await getCityServicePageModel(pricingCatalog, county, slug)
      : null;
  if (model === null) notFound();

  return <LocationPageView model={model} />;
}
