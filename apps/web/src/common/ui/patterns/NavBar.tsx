'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState, useLayoutEffect } from 'react';

import { CENTS_ORDER_URL } from '@/lib/content';
import { NavBarMobileFramer } from './NavBarMobileFramer';
import PrimaryButton from '../../ui/primitives/PrimaryButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shadcn/dropdown-menu';

const NAV_LINKS = [
  { href: '/services-pricing/wash-fold', label: 'Services & Pricing' },
  { href: '/commercial', label: 'Commercial' },
];

const LOCATION_ITEMS = [
  { label: 'New Jersey', href: '/new-jersey' },
  { label: 'Bergen County', href: '/new-jersey/bergen-county' },
  { label: 'Essex County', href: '/new-jersey/essex-county' },
  { label: 'Hudson County', href: '/new-jersey/hudson-county' },
  { label: 'Morris County', href: '/new-jersey/morris-county' },
  { label: 'Passaic County', href: '/new-jersey/passaic-county' },
  { label: 'Union County', href: '/new-jersey/union-county' },
];

export default function NavBar() {
  const headerRef = useRef<HTMLElement>(null);
  const [navbarHeight, setNavbarHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const updateHeight = () => {
      if (headerRef.current) setNavbarHeight(headerRef.current.offsetHeight);
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 bg-background/80 backdrop-blur"
    >
      <div className="mx-auto flex max-w-[1480px] items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-foreground cursor-pointer"
          >
            <Image
              src="/logo/nav-bar-logo.png"
              alt="Pressly logo"
              width={183}
              height={37}
              quality={100}
              style={{
                width: 'clamp(140px, 25vw, 183px)',
                height: 'auto',
                objectFit: 'contain',
              }}
            />
          </Link>

          <nav className="hidden items-center gap-6 lg:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-base font-medium text-foreground/80 transition hover:text-foreground cursor-pointer"
              >
                {link.label}
              </Link>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger className="h-auto px-0 text-base font-medium text-foreground/80 hover:text-foreground transition cursor-pointer bg-transparent border-0">
                Locations
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48">
                <DropdownMenuGroup>
                  {LOCATION_ITEMS.map((location) => (
                    <DropdownMenuItem key={location.href} asChild>
                      <Link className="cursor-pointer" href={location.href}>
                        {location.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
        <div className="flex items-center gap-4 lg:gap-8">
          <PrimaryButton className="h-auto bg-transparent p-0 text-base font-medium text-primary underline underline-offset-4 shadow-none transition hover:bg-transparent hover:text-foreground lg:hidden">
            Get Started
          </PrimaryButton>
          <a
            href={CENTS_ORDER_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden text-base font-medium text-foreground/80 transition hover:text-foreground lg:inline cursor-pointer"
          >
            Log In
          </a>

          <PrimaryButton
            href="/signup"
            className="min-w-[140px] hidden lg:flex"
          >
            Schedule a Pickup
          </PrimaryButton>
          <NavBarMobileFramer
            locationItems={LOCATION_ITEMS}
            navbarHeight={navbarHeight ?? 0}
          />
        </div>
      </div>
    </header>
  );
}
