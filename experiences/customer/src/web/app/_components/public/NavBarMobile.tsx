'use client';

import Link from 'next/link';
import { ChevronRight, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '#customer/components/ui/button';
import { CENTS_ORDER_URL } from '#customer/features/order-entry/config';
import { SchedulePickupButton } from '#customer/features/order-entry/ui/SchedulePickupButton';
import { useCustomerBrowserCapabilities } from '#customer/browser/capabilities';

type NavItem = { href: string; label: string };

function MobileCollapsible({
  label,
  items,
  onItemClick,
}: {
  label: string;
  items: NavItem[];
  onItemClick: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left text-xl font-normal text-foreground transition hover:text-foreground/80"
      >
        {label}
        <ChevronRight
          className={`size-5 transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-3 pb-5">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onItemClick}
              className="text-base text-foreground/70 transition hover:text-foreground cursor-pointer"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function NavBarMobile({
  locationItems,
  navbarHeight,
}: {
  locationItems: NavItem[];
  navbarHeight: number;
}) {
  const browser = useCustomerBrowserCapabilities();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    return browser.keyboard.subscribe((key) => {
      if (key === 'Escape') setIsOpen(false);
    });
  }, [browser.keyboard, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    return browser.page.lockScroll();
  }, [browser.page, isOpen]);

  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.3, ease: 'easeOut' as const },
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.2, ease: 'easeIn' as const },
    },
  };

  const menuVariants = {
    hidden: {
      opacity: 0,
    },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.3,
        ease: 'easeOut' as const,
      },
    },
    exit: {
      opacity: 0,
      transition: {
        duration: 0.2,
        ease: 'easeIn' as const,
      },
    },
  };

  const handleClose = () => setIsOpen(false);

  const portalTarget = browser.page.portalTarget();
  const mobileMenu =
    portalTarget === null
      ? null
      : createPortal(
          <AnimatePresence>
            {isOpen && (
              <>
                {/* Backdrop Overlay */}
                <motion.div
                  variants={overlayVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="fixed left-0 right-0 bottom-0 z-40 bg-black/50"
                  style={{ top: `${navbarHeight}px` }}
                  onClick={handleClose}
                />

                {/* Menu Content */}
                <motion.div
                  variants={menuVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  id="mobile-menu"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Navigation menu"
                  className="fixed left-0 right-0 z-40 flex flex-col overflow-y-auto bg-background px-6 shadow-lg"
                  style={{
                    top: `${navbarHeight}px`,
                    height: `calc(100vh - ${navbarHeight}px)`,
                  }}
                >
                  <nav className="flex flex-1 flex-col pt-4">
                    {/* Direct Links */}
                    <div className="border-b border-border">
                      <Link
                        href="/services-pricing/wash-fold"
                        onClick={handleClose}
                        className="flex w-full items-center justify-between py-5 text-left text-xl font-normal text-foreground transition hover:text-foreground/80 cursor-pointer"
                      >
                        Services
                      </Link>
                    </div>
                    <div className="border-b border-border">
                      <Link
                        href="/commercial"
                        onClick={handleClose}
                        className="flex w-full items-center justify-between py-5 text-left text-xl font-normal text-foreground transition hover:text-foreground/80 cursor-pointer"
                      >
                        Commercial
                      </Link>
                    </div>

                    {/* Locations Dropdown */}
                    <MobileCollapsible
                      label="Locations"
                      items={locationItems}
                      onItemClick={handleClose}
                    />
                  </nav>

                  <div className="mt-auto flex flex-col gap-3 pb-6 pt-6">
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full"
                      asChild
                    >
                      <a href={CENTS_ORDER_URL} className="cursor-pointer">
                        Log in
                      </a>
                    </Button>
                    <SchedulePickupButton
                      source="navbar_mobile_menu"
                      className="w-full"
                    >
                      Schedule a Pickup
                    </SchedulePickupButton>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          portalTarget,
        );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="lg:hidden"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-controls="mobile-menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </Button>

      {mobileMenu}
    </>
  );
}
