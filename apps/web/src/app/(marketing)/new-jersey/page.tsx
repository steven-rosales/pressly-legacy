import type { Metadata } from 'next';
import { serverPricingCatalogLoader } from '@/features/pricing/server';
import { getNewJerseyPageModel } from './model';
import { newJerseyMetadata } from './seo';
import { LocationPageView } from './ui/LocationPageView';

export const revalidate = 3600;
export const metadata: Metadata = newJerseyMetadata;

export default async function NewJerseyPage() {
  return (
    <LocationPageView
      model={await getNewJerseyPageModel(serverPricingCatalogLoader)}
    />
  );
}
