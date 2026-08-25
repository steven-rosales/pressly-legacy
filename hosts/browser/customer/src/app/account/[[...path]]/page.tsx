import { customerWeb } from '@pressly/generated-runtime/browser/customer';

export const metadata = customerWeb.account.metadata;
export default function AccountPage() {
  customerWeb.account.Page();
}
