import {
  makeCustomerBrowserRequestTransport,
  makeCustomerPricingBrowserClient,
} from '@pressly/experience-customer/browser';
import {
  createCustomerWebExperience,
  type CustomerWebExperience,
  type PricingCatalogLoader,
  type WebCore,
  type WebCorePorts,
} from '@pressly/experience-customer/web';
import { customerBrowserOperations } from '../browser-operations.js';

export const customerWeb: CustomerWebExperience = createCustomerWebExperience();

export type {
  PricingCatalogLoader,
  RequestClient,
  RequestInput,
  WebCore,
} from '@pressly/experience-customer/web';

export const createCustomerWebRuntime = (input: WebCorePorts): WebCore =>
  customerWeb.createCore(input);

export const makeCustomerPricingCatalogLoader = (
  input: Readonly<{
    core: WebCore;
    staticOnly: boolean;
    next?: Readonly<{ revalidate?: number; tags?: string[] }>;
  }>,
): PricingCatalogLoader => {
  const pricing = makeCustomerPricingBrowserClient({
    operation: customerBrowserOperations['pricing.load-pricing-catalog.v1'],
    request: makeCustomerBrowserRequestTransport({
      request: input.core.request,
      ...(input.next === undefined ? {} : { next: input.next }),
    }),
  });
  const queries = customerWeb.pricing.makeQueries({
    query: input.core.query,
    pricing,
  });

  return Object.freeze((request) =>
    customerWeb.pricing.loadCatalogViewModel(queries, request, {
      staticOnly: input.staticOnly,
    }),
  );
};
