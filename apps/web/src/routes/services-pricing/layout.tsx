import type { ReactNode } from 'react';

import { PublicSiteShell } from '@/routes/shared/public/PublicSiteShell';
import ServicesTabBar from './ui/ServiceTabBar';

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
