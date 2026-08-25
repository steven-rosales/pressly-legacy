import { customerWeb } from '@pressly/generated-runtime/browser/customer';

export const metadata = customerWeb.home.metadata;
export default function HomePage() {
  return <customerWeb.home.Page />;
}
