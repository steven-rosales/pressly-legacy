import { customerWeb } from '@pressly/topology/browser/customer';

export const metadata = customerWeb.contact.metadata;
export default function ContactPage() {
  return <customerWeb.contact.Page />;
}
