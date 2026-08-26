import { customerWeb } from '@pressly/topology/browser/customer';

export const metadata = customerWeb.about.metadata;
export default function AboutPage() {
  return <customerWeb.about.Page />;
}
