import { customerWeb } from '@pressly/generated-runtime/browser/customer';
import type { Metadata } from 'next';
import { serverPricingCatalogLoader } from '@/composition/customer-pricing.server';

export const revalidate = 3600;
export const dynamicParams = false;
export function generateStaticParams(): {
  county: string;
  slug: string;
}[] {
  return [...customerWeb.cityService.generateStaticParams()];
}
export async function generateMetadata(input: {
  params: Promise<{ county: string; slug: string }>;
}): Promise<Metadata> {
  return customerWeb.cityService.generateMetadata(input);
}
export default function CityServicePage(input: {
  params: Promise<{ county: string; slug: string }>;
}) {
  return customerWeb.cityService.render(input, serverPricingCatalogLoader);
}
