import { customerWeb } from '@pressly/topology/browser/customer';

export const metadata = customerWeb.login.metadata;
export default function LoginPage() {
  customerWeb.login.Page();
}
