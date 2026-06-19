import type { Result } from '@pressly/kernel';
import type { AppError } from '@pressly/errors';
import type {
  CommitPricingChangePlanInput,
  CurrentPricingForPublish,
  LoadCurrentPricingForPublishInput,
  PublishPricingChangeResult,
} from '@pressly/contracts';

export type PricingChangeStore = Readonly<{
  loadCurrentPricingForPublish: (
    input: LoadCurrentPricingForPublishInput,
  ) => Promise<Result<CurrentPricingForPublish, AppError>>;

  commitPricingChangePlan: (
    input: CommitPricingChangePlanInput,
  ) => Promise<Result<PublishPricingChangeResult, AppError>>;
}>;
