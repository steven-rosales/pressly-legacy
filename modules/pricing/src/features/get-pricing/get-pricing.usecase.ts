import type { AppError, Result } from '@pressly/errors';
import type { GetPricingCommand } from './get-pricing.command.js';
import type { PricingReader } from './get-pricing.port.js';
import type { GetPricingResult } from './get-pricing.result.js';

export type GetPricing = (
  command: GetPricingCommand,
) => Promise<Result<GetPricingResult, AppError>>;

export const makeGetPricing =
  (reader: PricingReader): GetPricing =>
  async (command) =>
    reader.getPricing(command);
