import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { PricingCatalog } from '../../../model/pricing.ts';
import type {
  LoadPricingCatalogExpectedFailure,
  LoadPricingCatalogQuery,
  LoadPricingCatalogRepository,
} from './types.ts';

export type ExecuteLoadPricingCatalog = (
  query: LoadPricingCatalogQuery,
) => Promise<CellOutcome<PricingCatalog, LoadPricingCatalogExpectedFailure>>;

export const makeExecuteLoadPricingCatalog = (
  repository: LoadPricingCatalogRepository,
): ExecuteLoadPricingCatalog =>
  async function executeLoadPricingCatalog(query) {
    try {
      const loaded = await repository(query);
      return loaded.kind === 'found'
        ? { kind: 'success', value: loaded.catalog }
        : {
            kind: 'failure',
            failure: {
              code: 'pricing_not_found',
              serviceSlug: query.serviceSlug,
              missing: loaded.missing,
            },
          };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'pricing_read_failed',
          message: 'Failed to read pricing.',
          safeMessage: 'Pricing is temporarily unavailable.',
          status: 503,
          cause,
        }),
      );
    }
  };
