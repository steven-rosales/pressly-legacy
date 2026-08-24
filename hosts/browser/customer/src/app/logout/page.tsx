import { customerWeb } from '@pressly/generated-runtime/browser/customer';

export const metadata = customerWeb.logout.metadata;
export default function LogoutPage() {
  customerWeb.logout.Page();
}
