import { invariantViolationError } from '@pressly/errors/factories';
import { createContext, useContext, type ReactNode } from 'react';

export type ProcessorBrowserStorageChange = Readonly<{
  key: string | null;
  newValue: string | null;
}>;

export type ProcessorBrowserKeyInput = Readonly<{
  key: string;
  repeat: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  editable: boolean;
  preventDefault: () => void;
}>;

export type ProcessorBrowserConnectivity = Readonly<{
  online: boolean;
  visible: boolean;
}>;

export type ProcessorBrowserCapabilities = Readonly<{
  storage: Readonly<{
    read: (key: string) => string | null;
    write: (key: string, value: string) => void;
    remove: (key: string) => void;
    subscribe: (
      listener: (change: ProcessorBrowserStorageChange) => void,
    ) => () => void;
  }>;
  localization: Readonly<{
    applyLanguage: (language: 'en' | 'es') => void;
    readLanguage: () => string;
  }>;
  theme: Readonly<{
    system: () => 'dark' | 'light';
    apply: (theme: 'dark' | 'light') => void;
    suppressTransitions: () => () => void;
    subscribeSystem: (listener: () => void) => () => void;
  }>;
  keyboard: Readonly<{
    subscribe: (
      listener: (input: ProcessorBrowserKeyInput) => void,
    ) => () => void;
  }>;
  viewport: Readonly<{
    matches: (query: string) => boolean | null;
    subscribe: (query: string, listener: () => void) => () => void;
  }>;
  connectivity: Readonly<{
    read: () => ProcessorBrowserConnectivity;
    subscribe: (
      listener: (state: ProcessorBrowserConnectivity) => void,
    ) => () => void;
  }>;
  clock: Readonly<{
    now: () => Date;
    monotonicNow: () => number;
  }>;
  scheduler: Readonly<{
    schedule: (callback: () => void, delayMs: number) => () => void;
    repeat: (callback: () => void, intervalMs: number) => () => void;
  }>;
  navigation: Readonly<{ reload: () => void }>;
  cookies: Readonly<{
    write: (name: string, value: string, maxAgeSeconds: number) => void;
  }>;
}>;

const ProcessorBrowserCapabilitiesContext =
  createContext<ProcessorBrowserCapabilities | null>(null);

export const ProcessorBrowserCapabilitiesProvider = ({
  capabilities,
  children,
}: Readonly<{
  capabilities: ProcessorBrowserCapabilities;
  children: ReactNode;
}>) => (
  <ProcessorBrowserCapabilitiesContext.Provider value={capabilities}>
    {children}
  </ProcessorBrowserCapabilitiesContext.Provider>
);

export const useProcessorBrowserCapabilities =
  (): ProcessorBrowserCapabilities => {
    const capabilities = useContext(ProcessorBrowserCapabilitiesContext);
    if (capabilities !== null) return capabilities;
    throw invariantViolationError({
      code: 'processor_browser_capabilities_missing',
      message:
        'Processor browser capabilities must be provided by the browser runtime binding.',
    });
  };
