'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function ServicesTabBar() {
  const pathname = usePathname();

  const tabs = [
    {
      name: 'Wash & Fold',
      href: '/services-pricing/wash-fold',
    },
    {
      name: 'Dry Cleaning',
      href: '/services-pricing/dry-cleaning',
    },
  ];

  return (
    <div className="sticky top-[68px] lg:top-[72px] z-30 border-b border-border bg-background">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
        <nav className="flex gap-8">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`py-4 text-base font-medium border-b-2 transition-colors cursor-pointer ${
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
