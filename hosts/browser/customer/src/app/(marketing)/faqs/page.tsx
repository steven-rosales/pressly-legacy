import { customerWeb } from '@pressly/topology/browser/customer';

export const metadata = customerWeb.faqs.metadata;
export default function FaqsPage() {
  return <customerWeb.faqs.Page />;
}
