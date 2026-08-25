import { customerWeb } from '@pressly/generated-runtime/browser/customer';

export const metadata = customerWeb.resetPassword.metadata;
export default function ResetPasswordPage() {
  customerWeb.resetPassword.Page();
}
