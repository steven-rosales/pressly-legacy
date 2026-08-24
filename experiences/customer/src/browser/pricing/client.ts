import { pricingCatalogHttpResultSchema } from '@pressly/pricing-system/http/catalog';
import { strictWireCodec } from '../transport.ts';
import type {
  CustomerPricingBrowserClient,
  MakeCustomerPricingBrowserClientInput,
} from './types.ts';

const catalogCodec = strictWireCodec(pricingCatalogHttpResultSchema);

export const makeCustomerPricingBrowserClient = (
  input: MakeCustomerPricingBrowserClientInput,
): CustomerPricingBrowserClient =>
  Object.freeze({
    loadCatalog: (serviceSlug) => {
      const surface = input.operation.http.pricing;
      return input.request(
        {
          method: surface.method,
          path: surface.path.replace(
            ':serviceSlug',
            encodeURIComponent(serviceSlug),
          ),
        },
        catalogCodec,
      );
    },
  });
