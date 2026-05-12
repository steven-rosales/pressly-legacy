import type { ReactNode } from 'react';

import Footer from './Footer';
import NavBar from './NavBar';
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
