import { customerWeb } from '@pressly/generated-runtime/browser/customer';

export const metadata = customerWeb.signup.metadata;
export default function SignupPage() {
  customerWeb.signup.Page();
}
