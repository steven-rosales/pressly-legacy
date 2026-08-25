import { bindCell, declareQueryCell } from '@pressly/cells';
import { resolveLocationAncestryContract } from './contract.ts';
import type { ResolveLocationAncestry } from './resolve-location-ancestry.usecase.ts';
import {
  successOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const resolveLocationAncestryCellDeclaration = declareQueryCell<
  OperationInput<ResolveLocationAncestry>,
  OperationOutput<ResolveLocationAncestry>,
  OperationFailure<ResolveLocationAncestry>
>({
  id: 'access.resolve-location-ancestry.v1',
  authentication: 'required',
  contract: resolveLocationAncestryContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'authorization.resolve_location_ancestry' },
});

export const makeResolveLocationAncestryCell = (
  operation: ResolveLocationAncestry,
) =>
  bindCell(resolveLocationAncestryCellDeclaration, successOperation(operation));
