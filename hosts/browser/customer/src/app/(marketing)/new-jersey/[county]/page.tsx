import { customerWeb } from '@pressly/generated-runtime/browser/customer';
import type { Metadata } from 'next';
import { serverPricingCatalogLoader } from '@/composition/customer-pricing.server';

export const revalidate = 3600;
export const dynamicParams = false;
export function generateStaticParams(): { county: string }[] {
  return [...customerWeb.county.generateStaticParams()];
}
export async function generateMetadata(input: {
  params: Promise<{ county: string }>;
}): Promise<Metadata> {
  return customerWeb.county.generateMetadata(input);
}
export default function CountyPage(input: {
  params: Promise<{ county: string }>;
}) {
  return customerWeb.county.render(input, serverPricingCatalogLoader);
}
