import type { AppError, Result } from '@pressly/errors';
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
