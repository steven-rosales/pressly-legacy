import { bindCell, declareQueryCell } from '@pressly/cells';
import type { PricingCatalog } from '../../../model/pricing.ts';
import { loadPricingCatalogContract } from './contract.ts';
import { makeExecuteLoadPricingCatalog } from './execute.ts';
import { loadPricingCatalogHttpSurfaces } from './http.ts';
import {
  loadPricingCatalogOperationId,
  type LoadPricingCatalogExpectedFailure,
  type LoadPricingCatalogQuery,
  type LoadPricingCatalogRepository,
} from './types.ts';

export const loadPricingCatalogCellDeclaration = declareQueryCell<
  LoadPricingCatalogQuery,
  PricingCatalog,
  LoadPricingCatalogExpectedFailure
>({
  id: loadPricingCatalogOperationId,
  authentication: 'none',
  contract: loadPricingCatalogContract,
  surfaces: loadPricingCatalogHttpSurfaces,
  observability: { operation: 'pricing.load_pricing_catalog' },
});

export const makeLoadPricingCatalogCell = (
  repository: LoadPricingCatalogRepository,
) =>
  bindCell(
    loadPricingCatalogCellDeclaration,
    makeExecuteLoadPricingCatalog(repository),
  );
