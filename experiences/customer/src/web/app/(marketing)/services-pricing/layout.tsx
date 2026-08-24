import type { ReactNode } from 'react';

import ServicesTabBar from './ui/ServiceTabBar';

export default function ServicesPricingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <ServicesTabBar />
      {children}
    </>
  );
}
