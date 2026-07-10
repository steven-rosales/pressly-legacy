import type { Result } from '@pressly/kernel';
import type { AppError } from '@pressly/errors';
import type {
  PricingChangePlan,
  PublishPricingChangeResult,
} from '@pressly/contracts';
import type {
  CurrentPricingItem,
  CurrentPricingSet,
  PublishPricingChangeCommand,
} from './publish-pricing-change.policy.ts';

export type { PublishPricingChangeCommand };

export type LoadCurrentPricingForPublishInput = Readonly<{
  serviceSlug: PublishPricingChangeCommand['serviceSlug'];
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
