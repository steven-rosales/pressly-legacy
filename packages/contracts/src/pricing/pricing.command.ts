import type { z } from 'zod';
import type {
  pricingParamsRequestSchema,
  pricingChangeRequestSchema,
  publishPricingChangeItemSchema,
} from './pricing.contracts.js';

export type PricingParamsRequest = z.infer<typeof pricingParamsRequestSchema>;

/** @deprecated Use PricingParamsRequest for the serialized route parameters. */
export type LoadPricingCatalogCommand = PricingParamsRequest;

/** @deprecated Use PricingParamsRequest. */
export type PricingParamsRequestSchema = PricingParamsRequest;

export type PublishPricingChangeItem = z.infer<
  typeof publishPricingChangeItemSchema
>;

export type PricingChangeRequest = z.infer<typeof pricingChangeRequestSchema>;
