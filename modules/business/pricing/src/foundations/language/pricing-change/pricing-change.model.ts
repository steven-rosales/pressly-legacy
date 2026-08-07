import type { PricingServiceSlug } from '../pricing/pricing.value.ts';

export type PricingChangeAuthor = Readonly<{
  id: string;
  kind: 'human' | 'service';
  displayName: string;
}>;

export type PricingChangeItem = Readonly<{
  code: string;
  priceCents: number;
}>;

export type PricingChangeCommand = Readonly<{
  serviceSlug: PricingServiceSlug;
  reason: string;
  requestedBy: PricingChangeAuthor;
  items: readonly PricingChangeItem[];
}>;

export type CurrentPricingSet = Readonly<{
  id: string;
  currency: string;
}>;

export type CurrentPricingItem = Readonly<{
  code: string;
  name: string;
  priceCents: number;
}>;

export type CurrentPricing = Readonly<{
  currentSet: CurrentPricingSet;
  currentItems: readonly CurrentPricingItem[];
}>;

export type PricingChangeDiffItem = Readonly<{
  code: string;
  name: string;
  oldPriceCents: number;
  newPriceCents: number;
}>;

export type PricingChangePlan = Readonly<{
  serviceSlug: PricingServiceSlug;
  reason: string;
  oldPricingSetId: string;
  currency: string;
  changes: readonly PricingChangeDiffItem[];
}>;

export type PublishedPricingChange = Readonly<{
  oldPricingSetId: string;
  newPricingSetId: string;
  auditEventId: string;
  changeItemCount: number;
}>;
