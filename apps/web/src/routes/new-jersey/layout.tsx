import type { ReactNode } from 'react';

import { PublicSiteShell } from '@/routes/shared/public/PublicSiteShell';

export default function NewJerseyLayout({ children }: { children: ReactNode }) {
  return <PublicSiteShell>{children}</PublicSiteShell>;
}
