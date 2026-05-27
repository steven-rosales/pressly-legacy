import type { Actor, IdentityKind } from '@pressly/auth';
import type {
  LoadPricingCatalogCommand,
  PublishPricingChangeCommand,
  PublishPricingChangeResult,
} from '@pressly/contracts';
import type {
  CurrentPricingItem,
  CurrentPricingSet,
} from '../../src/domain/publish-pricing-change.policy.ts';

export const makeAdminActor = (
  id = 'user_1',
  kind: IdentityKind = 'human',
  displayName = 'steven',
): Omit<Actor, 'permissions'> => ({
  id,
  kind,
  displayName,
  role: 'admin',
});

export const makeDeveloperActor = (): Omit<Actor, 'permissions'> => ({
  id: 'user_2',
  kind: 'human',
  displayName: 'Developer',
  role: 'developer',
});

export const makePublishPricingChangeCommand = (
  overrides: Partial<PublishPricingChangeCommand> = {},
): PublishPricingChangeCommand => ({
  serviceSlug: 'wash-fold',
  reason: 'Update delivery fee',
  actor: makeAdminActor(),
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
  overrides: Partial<PublishPricingChangeResult> = {},
): PublishPricingChangeResult => ({
  oldPricingSetId: 'set_1',
  newPricingSetId: 'set_2',
  auditEventId: 'event_1',
  changeItemCount: 1,
  ...overrides,
});

export const makeLoadPricingCatalogCommand = (
  overrides: Partial<LoadPricingCatalogCommand> = {},
): LoadPricingCatalogCommand => ({
  serviceSlug: 'wash-fold',
  ...overrides,
});
