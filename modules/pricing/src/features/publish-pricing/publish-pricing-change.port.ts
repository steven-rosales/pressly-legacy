import type { AppError, Result } from '@pressly/errors';
import type {
  PricingChangePlan,
  PublishPricingChangeCommand,
  PublishPricingChangeResult,
} from '@pressly/contracts';
import type {
  CurrentPricingItem,
  CurrentPricingSet,
} from '../../domain/publish-pricing-change.policy.ts';

export type LoadCurrentPricingForPublishInput = Readonly<{
  serviceSlug: PublishPricingChangeCommand['serviceSlug'];
  locationSlug?: NonNullable<PublishPricingChangeCommand['locationSlug']>;
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

export type PricingChangeStore = Readonly<{
  loadCurrentPricingForPublish: (
    input: LoadCurrentPricingForPublishInput,
  ) => Promise<Result<CurrentPricingForPublish, AppError>>;

  commitPricingChangePlan: (
    input: CommitPricingChangePlanInput,
  ) => Promise<Result<PublishPricingChangeResult, AppError>>;
}>;
