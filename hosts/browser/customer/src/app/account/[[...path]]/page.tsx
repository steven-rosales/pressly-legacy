import { customerWeb } from '@pressly/topology/browser/customer';

export const metadata = customerWeb.account.metadata;
export default function AccountPage() {
  customerWeb.account.Page();
}
