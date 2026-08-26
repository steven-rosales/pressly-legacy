import { customerWeb } from '@pressly/topology/browser/customer';

export const metadata = customerWeb.logout.metadata;
export default function LogoutPage() {
  customerWeb.logout.Page();
}
