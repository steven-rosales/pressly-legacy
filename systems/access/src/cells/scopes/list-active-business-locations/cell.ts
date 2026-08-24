import { bindCell, declareQueryCell } from '@pressly/cells';
import {
  successOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import { listActiveBusinessLocationsContract } from './contract.ts';
import type { ListActiveBusinessLocations } from './list-active-business-locations.usecase.ts';

export const listActiveBusinessLocationsCellDeclaration = declareQueryCell<
  OperationInput<ListActiveBusinessLocations>,
  OperationOutput<ListActiveBusinessLocations>,
  OperationFailure<ListActiveBusinessLocations>
>({
  id: 'access.list-active-business-locations.v1',
  authentication: 'required',
  contract: listActiveBusinessLocationsContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'access.list_active_business_locations' },
});

export const makeListActiveBusinessLocationsCell = (
  operation: ListActiveBusinessLocations,
) =>
  bindCell(
    listActiveBusinessLocationsCellDeclaration,
    successOperation(operation),
  );
