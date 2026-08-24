import type { Result } from '@pressly/cells/result';
import type { Clock } from '@pressly/time';
import type {
  PricingChangeCommand,
  PricingChangeCommitFailure,
  PricingChangePlan,
  PricingChangePolicyFailure,
  PublishedPricingChange,
} from '../../../model/pricing-change.ts';
import type { CurrentPricingReader } from '../../../postgres/current-pricing.postgres.ts';

export const publishPricingChangeOperationId =
  'pricing.publish-pricing-change.v1' as const;

export type PublishPricingChangeExpectedFailure =
  | PricingChangePolicyFailure
  | PricingChangeCommitFailure;

export type CommitPricingChangeInput = Readonly<{
  command: PricingChangeCommand;
  plan: PricingChangePlan;
  publishedAt: Date;
}>;

export type PricingChangePublisher = (
  input: CommitPricingChangeInput,
) => Promise<Result<PublishedPricingChange, PricingChangeCommitFailure>>;

export type PublishPricingChangeDependencies = Readonly<{
  loadCurrentPricing: CurrentPricingReader;
  publishPricingChange: PricingChangePublisher;
  clock: Clock;
}>;
