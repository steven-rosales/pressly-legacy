import {
  pricingCatalogSchema,
  pricingParamsRequestSchema,
  type PricingCatalogResult,
  type PricingParamsRequest,
} from '@pressly/contracts/pricing';
import { utcIsoFromDate } from '@pressly/time';
import type {
  LoadPricingCatalogCommand,
  PricingCatalog,
} from './load-pricing-catalog.model.ts';

export const loadPricingCatalogContract = Object.freeze({
  params: pricingParamsRequestSchema,
  response: pricingCatalogSchema,
});

export const toLoadPricingCatalogCommand = (
  params: PricingParamsRequest,
): LoadPricingCatalogCommand => ({
  serviceSlug: params.serviceSlug,
});

export const toPricingCatalogResult = (
  catalog: PricingCatalog,
): PricingCatalogResult => ({
  serviceSlug: catalog.serviceSlug,
  currency: catalog.currency,
  updatedAt: utcIsoFromDate(catalog.updatedAt),
  items: catalog.items.map((item) => ({
    service: item.service,
    unit: item.unit,
    category: item.category,
    name: item.name,
    priceCents: item.priceCents,
    sortOrder: item.sortOrder,
    metadata: {
      ...(item.metadata.minimumThresholdQuantity === undefined
        ? {}
        : {
            minimumThresholdQuantity: item.metadata.minimumThresholdQuantity,
          }),
      ...(item.metadata.displayUnitLabel === undefined
        ? {}
        : { displayUnitLabel: item.metadata.displayUnitLabel }),
    },
  })),
});
