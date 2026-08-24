import { customerWeb } from '@pressly/generated-runtime/browser/customer';

export const metadata = customerWeb.terms.metadata;
export default function TermsPage() {
  return <customerWeb.terms.Page />;
}
