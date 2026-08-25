'use client';

import {
  customerWebClient,
  type CustomerBrowserCapabilities,
} from '@pressly/generated-runtime/browser/customer-client';
import type { ReactNode } from 'react';

const customerBrowserCapabilities = Object.freeze({
  viewport: Object.freeze({
    subscribeResize: (listener: () => void) => {
      window.addEventListener('resize', listener);
      return () => window.removeEventListener('resize', listener);
    },
  }),
  keyboard: Object.freeze({
    subscribe: (listener: (key: string) => void) => {
      const handleKeyDown = (event: KeyboardEvent) => listener(event.key);
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    },
  }),
  page: Object.freeze({
    lockScroll: () => {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    },
    portalTarget: () =>
      typeof document === 'undefined' ? null : document.body,
  }),
} satisfies CustomerBrowserCapabilities);

export const CustomerBrowserCapabilitiesHost = ({
  children,
}: Readonly<{ children: ReactNode }>) => (
  <customerWebClient.BrowserCapabilitiesProvider
    capabilities={customerBrowserCapabilities}
  >
    {children}
  </customerWebClient.BrowserCapabilitiesProvider>
);
