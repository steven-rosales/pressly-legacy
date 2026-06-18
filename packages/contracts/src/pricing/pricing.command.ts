import type { z } from 'zod';
import type {
  loadPricingCatalogCommandSchema,
  pricingParamsRequestSchema,
  pricingChangeAuthorSchema,
  pricingChangeRequestSchema,
  publishPricingChangeCommandSchema,
  publishPricingChangeItemSchema,
} from './pricing.contracts.js';

export type LoadPricingCatalogCommand = z.infer<
  typeof loadPricingCatalogCommandSchema
>;

export type PricingParamsRequestSchema = z.infer<
  typeof pricingParamsRequestSchema
>;

export type PricingChangeAuthor = z.infer<typeof pricingChangeAuthorSchema>;

export type PublishPricingChangeItem = z.infer<
  typeof publishPricingChangeItemSchema
>;

export type PublishPricingChangeCommand = z.infer<
  typeof publishPricingChangeCommandSchema
>;

export type PricingChangeRequest = z.infer<typeof pricingChangeRequestSchema>;

export type LoadCurrentPricingForPublishInput = Readonly<{
  serviceSlug: PublishPricingChangeCommand['serviceSlug'];
  locationSlug?: NonNullable<PublishPricingChangeCommand['locationSlug']>;
}>;

export type PricingModuleAction = 'pricing:plan' | 'pricing:publish';

export type PricingModuleRole = 'owner' | 'admin';

export type PricingModuleAuthorizationInput = Readonly<{
  action: PricingModuleAction;
  roles: readonly PricingModuleRole[];
  freshSessionMaxAgeMinutes?: number;
}>;
