import type { ReactNode } from 'react';

import Footer from '@/common/ui/patterns/Footer';
import NavBar from '@/common/ui/patterns/NavBar';
import { cn } from '@/styles/utils';

type PublicSiteShellProps = {
  children: ReactNode;
  afterHeader?: ReactNode;
  mainClassName?: string;
};

export function PublicSiteShell({
  children,
  afterHeader,
  mainClassName,
}: PublicSiteShellProps) {
  return (
    <>
      <NavBar />
      {afterHeader}
      <main className={cn(mainClassName)}>{children}</main>
      <Footer />
    </>
  );
}
