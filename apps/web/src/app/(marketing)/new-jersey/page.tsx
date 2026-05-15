import type { Metadata } from 'next';
import { getNewJerseyPageModel, newJerseyMetadata } from './model';
import { LocationPageView } from './ui/LocationPageView';

export const revalidate = 3600;
export const metadata: Metadata = newJerseyMetadata;

export default async function NewJerseyPage() {
  return <LocationPageView model={await getNewJerseyPageModel()} />;
}
