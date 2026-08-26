import { customerWeb } from '@pressly/topology/browser/customer';

export const metadata = customerWeb.commercial.metadata;
export default function CommercialPage() {
  return <customerWeb.commercial.Page />;
}
