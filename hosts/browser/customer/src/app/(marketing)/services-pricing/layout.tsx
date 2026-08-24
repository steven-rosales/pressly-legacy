import { customerWeb } from '@pressly/generated-runtime/browser/customer';
import type { ReactNode } from 'react';

export default function ServicesPricingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <customerWeb.servicesPricing.Layout>
      {children}
    </customerWeb.servicesPricing.Layout>
  );
}
