import type { PricingServiceSlug } from '@pressly/contracts';

export type GetPricingCommand = Readonly<{
  serviceSlug: PricingServiceSlug;
  locationSlug?: string;
}>;
