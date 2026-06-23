import type { z } from 'zod';
import type {
  loadPricingCatalogCommandSchema,
  pricingParamsRequestSchema,
  pricingChangeRequestSchema,
  publishPricingChangeItemSchema,
} from './pricing.contracts.js';

export type LoadPricingCatalogCommand = z.infer<
  typeof loadPricingCatalogCommandSchema
>;

export type PricingParamsRequestSchema = z.infer<
  typeof pricingParamsRequestSchema
>;

export type PublishPricingChangeItem = z.infer<
  typeof publishPricingChangeItemSchema
>;

export type PricingChangeRequest = z.infer<typeof pricingChangeRequestSchema>;
