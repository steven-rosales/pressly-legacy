import { customerWeb } from '@pressly/generated-runtime/browser/customer';

export const metadata = customerWeb.careers.metadata;
export default function CareersPage() {
  return <customerWeb.careers.Page />;
}
