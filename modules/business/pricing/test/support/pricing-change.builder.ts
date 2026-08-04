import type { PublishedPricingChange } from '../../src/foundations/language/pricing-change/pricing-change.model.ts';
import type {
  CurrentPricingItem,
  CurrentPricingSet,
  PricingChangeAuthor,
  PricingChangeCommand,
} from '../../src/foundations/language/pricing-change/pricing-change.model.ts';

export const makePricingChangeAuthor = (
  id = 'user_1',
  kind: PricingChangeAuthor['kind'] = 'human',
  displayName = 'steven',
): PricingChangeAuthor => ({
  id,
  kind,
  displayName,
});

export const makePricingChangeCommand = (
  overrides: Partial<PricingChangeCommand> = {},
): PricingChangeCommand => ({
  serviceSlug: 'wash-fold',
  reason: 'Update delivery fee',
  requestedBy: makePricingChangeAuthor(),
  items: [{ code: 'delivery_fee', priceCents: 100 }],
  ...overrides,
});

export const makeCurrentPricingSet = (
  overrides: Partial<CurrentPricingSet> = {},
): CurrentPricingSet => ({
  id: 'set_1',
  currency: 'USD',
  ...overrides,
});

export const makeCurrentPricingItem = (
  overrides: Partial<CurrentPricingItem> = {},
): CurrentPricingItem => ({
  code: 'delivery_fee',
  name: 'Delivery fee',
  priceCents: 495,
  ...overrides,
});

export const makeCurrentPricingItems = (
  items: Partial<CurrentPricingItem>[] = [{}],
): CurrentPricingItem[] => items.map(makeCurrentPricingItem);

export const makePublishPricingChangeResult = (
  overrides: Partial<PublishedPricingChange> = {},
): PublishedPricingChange => ({
  oldPricingSetId: 'set_1',
  newPricingSetId: 'set_2',
  auditEventId: 'event_1',
  changeItemCount: 1,
  ...overrides,
});
