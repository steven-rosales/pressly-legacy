import { customerWeb } from '@pressly/generated-runtime/browser/customer';

export const metadata = customerWeb.privacy.metadata;
export default function PrivacyPage() {
  return <customerWeb.privacy.Page />;
}
