'use client';

import { invariantViolationError } from '@pressly/errors/factories';
import { createContext, useContext, type ReactNode } from 'react';

export type CustomerBrowserCapabilities = Readonly<{
  viewport: Readonly<{
    subscribeResize: (listener: () => void) => () => void;
  }>;
  keyboard: Readonly<{
    subscribe: (listener: (key: string) => void) => () => void;
  }>;
  page: Readonly<{
    lockScroll: () => () => void;
    portalTarget: () => Element | null;
  }>;
}>;

const CustomerBrowserCapabilitiesContext =
  createContext<CustomerBrowserCapabilities | null>(null);

export const CustomerBrowserCapabilitiesProvider = ({
  capabilities,
  children,
}: Readonly<{
  capabilities: CustomerBrowserCapabilities;
  children: ReactNode;
}>) => (
  <CustomerBrowserCapabilitiesContext.Provider value={capabilities}>
    {children}
  </CustomerBrowserCapabilitiesContext.Provider>
);

export const useCustomerBrowserCapabilities =
  (): CustomerBrowserCapabilities => {
    const capabilities = useContext(CustomerBrowserCapabilitiesContext);
    if (capabilities !== null) return capabilities;
    throw invariantViolationError({
      code: 'customer_browser_capabilities_missing',
      message:
        'Customer browser capabilities must be provided by the browser runtime binding.',
    });
  };
