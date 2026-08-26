import { customerWeb } from '@pressly/topology/browser/customer';

export const metadata = customerWeb.resetPassword.metadata;
export default function ResetPasswordPage() {
  customerWeb.resetPassword.Page();
}
