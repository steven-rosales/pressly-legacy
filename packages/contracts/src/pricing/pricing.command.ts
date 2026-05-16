import type { z } from 'zod';
import type {
  loadPricingCatalogCommandSchema,
  pricingParamsRequestSchema,
  publishPricingChangeActorSchema,
  publishPricingChangeCommandSchema,
  publishPricingChangeItemSchema,
} from './pricing.contracts.js';

export type LoadPricingCatalogCommand = z.infer<
  typeof loadPricingCatalogCommandSchema
>;

export type PricingParamsRequestSchema = z.infer<
  typeof pricingParamsRequestSchema
>;

export type PublishPricingChangeActor = z.infer<
  typeof publishPricingChangeActorSchema
>;

export type PublishPricingChangeItem = z.infer<
  typeof publishPricingChangeItemSchema
>;

export type PublishPricingChangeCommand = z.infer<
  typeof publishPricingChangeCommandSchema
>;
