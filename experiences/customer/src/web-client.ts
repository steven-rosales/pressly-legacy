import { CustomerGlobalErrorView } from './web/app/global-error-view.tsx';
import { CustomerBrowserCapabilitiesProvider } from './web/browser/capabilities.tsx';
import { createWebCore } from './web/composition/model/core.ts';
import { CustomerWebCoreProvider } from './web/composition/web-core-context.tsx';

export type { CustomerBrowserCapabilities } from './web/browser/capabilities.tsx';

export const createCustomerWebClientExperience = () =>
  Object.freeze({
    createCore: createWebCore,
    Provider: CustomerWebCoreProvider,
    BrowserCapabilitiesProvider: CustomerBrowserCapabilitiesProvider,
    GlobalErrorView: CustomerGlobalErrorView,
  });

export type CustomerWebClientExperience = ReturnType<
  typeof createCustomerWebClientExperience
>;
