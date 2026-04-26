import type { ReactNode } from 'react';

import { ServicesTabBar } from '@/routes/shared/marketing/public';
import { PublicSiteShell } from '@/routes/shared/public/PublicSiteShell';

export default function ServicesPricingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PublicSiteShell afterHeader={<ServicesTabBar />}>
      {children}
    </PublicSiteShell>
  );
}
