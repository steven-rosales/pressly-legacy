import type { Result } from '@pressly/kernel';
import type { PricingChangeCommitFailure } from '../../../foundations/language/pricing-change/pricing-change.failure.ts';
import type {
  PricingChangeCommand,
  PricingChangePlan,
  PublishedPricingChange,
} from '../../../foundations/language/pricing-change/pricing-change.model.ts';

export type CommitPricingChangeInput = Readonly<{
  command: PricingChangeCommand;
  plan: PricingChangePlan;
  publishedAt: Date;
}>;

export type PricingChangePublisher = (
  input: CommitPricingChangeInput,
) => Promise<Result<PublishedPricingChange, PricingChangeCommitFailure>>;
