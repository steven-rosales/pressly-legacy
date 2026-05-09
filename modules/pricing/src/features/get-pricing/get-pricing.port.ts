import type { AppError, Result } from '@pressly/errors';
import type { GetPricingCommand } from './get-pricing.command.js';
import type { GetPricingResult } from './get-pricing.result.js';

export type PricingReader = Readonly<{
  getPricing: (
    command: GetPricingCommand,
  ) => Promise<Result<GetPricingResult, AppError>>;
}>;
