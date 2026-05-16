import type {
  PublishPricingChangeCommand,
  PublishPricingChangeResult,
} from '@pressly/contracts';
import type { AppError, Result } from '@pressly/errors';

export type PublishPricingChange = (
  command: PublishPricingChangeCommand,
) => Promise<Result<PublishPricingChangeResult, AppError>>;
