import { customerWeb } from '@pressly/generated-runtime/browser/customer';

export const metadata = customerWeb.optIn.metadata;
export default function OptInPage() {
  customerWeb.optIn.Page();
}
