import { customerWeb } from '@pressly/generated-runtime/browser/customer';

export const metadata = customerWeb.servicesPricing.metadata;
export default function ServicesPricingPage() {
  customerWeb.servicesPricing.Page();
}
