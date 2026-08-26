import { customerWeb } from '@pressly/topology/browser/customer';

export const metadata = customerWeb.servicesPricing.metadata;
export default function ServicesPricingPage() {
  customerWeb.servicesPricing.Page();
}
