import { defineOperation } from '@pressly/cells';
import { resolveProductionVisibilityContract } from './contract.ts';
import type { ResolveProductionVisibility } from './resolve-production-visibility.usecase.ts';
import {
  successOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const resolveProductionVisibilityCellDeclaration = defineOperation<
  OperationInput<ResolveProductionVisibility>,
  OperationOutput<ResolveProductionVisibility>,
  OperationFailure<ResolveProductionVisibility>
>({
  kind: 'query',
  id: 'access.resolve-production-visibility.v1',
  authentication: 'required',
  contract: resolveProductionVisibilityContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'authorization.resolve_production_visibility' },
});

export const makeResolveProductionVisibilityCell = (
  operation: ResolveProductionVisibility,
) =>
  defineOperation(
    resolveProductionVisibilityCellDeclaration,
    successOperation(operation),
  );
