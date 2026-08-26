import { customerWeb } from '@pressly/topology/browser/customer';
import { serverPricingCatalogLoader } from '@/composition/customer-pricing.server';

export const revalidate = 3600;
export const metadata = customerWeb.washFold.metadata;
export default function WashFoldPage() {
  return customerWeb.washFold.render(serverPricingCatalogLoader);
}
