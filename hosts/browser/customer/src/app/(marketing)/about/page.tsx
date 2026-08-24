import { customerWeb } from '@pressly/generated-runtime/browser/customer';

export const metadata = customerWeb.about.metadata;
export default function AboutPage() {
  return <customerWeb.about.Page />;
}
