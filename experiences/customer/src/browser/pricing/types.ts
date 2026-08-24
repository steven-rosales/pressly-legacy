import type { PricingCatalogHttpResult } from '@pressly/pricing-system/http/catalog';
import type { CustomerBrowserRequestTransport } from '../transport.ts';

export type CustomerPricingOperation = Readonly<{
  operationId: 'pricing.load-pricing-catalog.v1';
  contract: Readonly<{
    inputVersion: number;
    outputVersion: number;
    failureVersion: number;
  }>;
  http: Readonly<{
    pricing: Readonly<{
      method: 'GET';
      path: string;
    }>;
  }>;
}>;

export type CustomerPricingBrowserClient = Readonly<{
  loadCatalog: (
    serviceSlug: PricingCatalogHttpResult['serviceSlug'],
  ) => Promise<PricingCatalogHttpResult>;
}>;

export type MakeCustomerPricingBrowserClientInput = Readonly<{
  operation: CustomerPricingOperation;
  request: CustomerBrowserRequestTransport;
}>;
