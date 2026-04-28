import type { ReactNode } from 'react';

import { PublicSiteShell } from '@/routes/shared/ui/public/PublicSiteShell';

export default function NewJerseyLayout({ children }: { children: ReactNode }) {
  return <PublicSiteShell>{children}</PublicSiteShell>;
}
