/* This file is generated from the checked deployment topology. */
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
import { pricingLoadPricingCatalogV1 } from '@pressly/generated/clients/customer';

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
    operation: pricingLoadPricingCatalogV1,
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
