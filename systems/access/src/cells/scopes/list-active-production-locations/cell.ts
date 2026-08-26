import { defineOperation } from '@pressly/cells';
import {
  successOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import { listActiveProductionLocationsContract } from './contract.ts';
import type { ListActiveProductionLocations } from './list-active-production-locations.usecase.ts';

export const listActiveProductionLocationsCellDeclaration = defineOperation<
  OperationInput<ListActiveProductionLocations>,
  OperationOutput<ListActiveProductionLocations>,
  OperationFailure<ListActiveProductionLocations>
>({
  kind: 'query',
  id: 'access.list-active-production-locations.v1',
  authentication: 'required',
  contract: listActiveProductionLocationsContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'access.list_active_production_locations' },
});

export const makeListActiveProductionLocationsCell = (
  operation: ListActiveProductionLocations,
) =>
  defineOperation(
    listActiveProductionLocationsCellDeclaration,
    successOperation(operation),
  );
