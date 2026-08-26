import { customerWeb } from '@pressly/topology/browser/customer';

export const metadata = customerWeb.terms.metadata;
export default function TermsPage() {
  return <customerWeb.terms.Page />;
}
