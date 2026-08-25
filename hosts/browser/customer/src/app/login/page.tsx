import { customerWeb } from '@pressly/generated-runtime/browser/customer';

export const metadata = customerWeb.login.metadata;
export default function LoginPage() {
  customerWeb.login.Page();
}
