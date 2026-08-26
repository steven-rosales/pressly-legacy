import { customerWeb } from '@pressly/topology/browser/customer';

export const metadata = customerWeb.privacy.metadata;
export default function PrivacyPage() {
  return <customerWeb.privacy.Page />;
}
