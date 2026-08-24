import { customerWeb } from '@pressly/generated-runtime/browser/customer';

export const metadata = customerWeb.commercial.metadata;
export default function CommercialPage() {
  return <customerWeb.commercial.Page />;
}
