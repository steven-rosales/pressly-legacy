import { customerWeb } from '@pressly/generated-runtime/browser/customer';
import type { ReactNode } from 'react';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <customerWeb.marketing.Layout>{children}</customerWeb.marketing.Layout>
  );
}
