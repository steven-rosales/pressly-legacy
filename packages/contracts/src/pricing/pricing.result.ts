import type { z } from 'zod';
import type {
  pricingCatalogSchema,
  pricingItemSchema,
  pricingServiceSlugSchema,
} from './pricing.contracts.js';
import type { PublishPricingChangeCommand } from './pricing.command.js';

export type PricingServiceSlug = z.infer<typeof pricingServiceSlugSchema>;

export type PricingItemResult = z.infer<typeof pricingItemSchema>;

export type PricingCatalogResult = z.infer<typeof pricingCatalogSchema>;

export type PricingChangeDiffItem = Readonly<{
  code: string;
  name: string;
  oldPriceCents: number;
  newPriceCents: number;
}>;

export type PricingChangePlan = Readonly<{
  serviceSlug: PricingServiceSlug;
  locationSlug?: string;
  reason: string;
  oldPricingSetId: string;
  currency: string;
  changes: readonly PricingChangeDiffItem[];
}>;

export type LoadPricingCatalogResult = PricingCatalogResult;

export type CurrentPricingSet = Readonly<{
  id: string;
  currency: string;
}>;

export type CurrentPricingItem = Readonly<{
  code: string;
  name: string;
  priceCents: number;
}>;

export type CurrentPricingForPublish = Readonly<{
  currentSet: CurrentPricingSet;
  currentItems: readonly CurrentPricingItem[];
}>;

export type CommitPricingChangePlanInput = Readonly<{
  command: PublishPricingChangeCommand;
  plan: PricingChangePlan;
  publishedAt: Date;
}>;

export type PublishPricingChangeResult = Readonly<{
  oldPricingSetId: string;
  newPricingSetId: string;
  auditEventId: string;
  changeItemCount: number;
}>;
