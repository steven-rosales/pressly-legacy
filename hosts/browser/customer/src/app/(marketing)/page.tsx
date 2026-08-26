import { customerWeb } from '@pressly/topology/browser/customer';

export const metadata = customerWeb.home.metadata;
export default function HomePage() {
  return <customerWeb.home.Page />;
}
