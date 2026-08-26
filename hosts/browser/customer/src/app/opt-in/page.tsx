import { customerWeb } from '@pressly/topology/browser/customer';

export const metadata = customerWeb.optIn.metadata;
export default function OptInPage() {
  customerWeb.optIn.Page();
}
