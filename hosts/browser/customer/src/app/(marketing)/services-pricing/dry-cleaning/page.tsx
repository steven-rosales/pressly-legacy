import { customerWeb } from '@pressly/topology/browser/customer';
import { serverPricingCatalogLoader } from '@/composition/customer-pricing.server';

export const revalidate = 3600;
export const metadata = customerWeb.dryCleaning.metadata;
export default function DryCleaningPage() {
  return customerWeb.dryCleaning.render(serverPricingCatalogLoader);
}
