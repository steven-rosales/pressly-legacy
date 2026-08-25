'use client';

import { invariantViolationError } from '@pressly/errors/factories';
import { createContext, useContext, type PropsWithChildren } from 'react';
import type { WebCore } from './model/core.ts';

const WebCoreContext = createContext<WebCore | null>(null);

export const CustomerWebCoreProvider = ({
  core,
  children,
}: PropsWithChildren<{ core: WebCore }>) => (
  <WebCoreContext.Provider value={core}>{children}</WebCoreContext.Provider>
);

export const useWebCore = (): WebCore => {
  const core = useContext(WebCoreContext);

  if (core === null)
    throw invariantViolationError({
      code: 'web_core_provider_missing',
      message: 'useWebCore must be used inside CustomerWebCoreProvider.',
      safeMessage: 'Application runtime is unavailable.',
    });

  return core;
};
