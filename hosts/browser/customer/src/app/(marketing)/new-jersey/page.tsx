import { customerWeb } from '@pressly/topology/browser/customer';
import { serverPricingCatalogLoader } from '@/composition/customer-pricing.server';

export const revalidate = 3600;
export const metadata = customerWeb.newJersey.metadata;
export default function NewJerseyPage() {
  return customerWeb.newJersey.render(serverPricingCatalogLoader);
}
