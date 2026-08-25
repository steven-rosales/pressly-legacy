import type { ReactNode } from 'react';

import Footer from '#customer/app/_components/public/Footer';
import NavBar from '#customer/app/_components/public/NavBar';

export default function MarketingLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <NavBar />
      <main className="bg-background">{children}</main>
      <Footer />
    </>
  );
}
