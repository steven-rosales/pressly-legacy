import { customerWeb } from '@pressly/topology/browser/customer';

export const metadata = customerWeb.signup.metadata;
export default function SignupPage() {
  customerWeb.signup.Page();
}
