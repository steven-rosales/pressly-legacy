import type { ListProductionLocationsResult } from './boundary.ts';
import { defineOperation } from '@pressly/cells';
import { listLocationsContract } from './contract.ts';
import {
  makeExecuteListLocations,
  type ListLocationsDependencies,
} from './execute.ts';
import { listLocationsHttpSurfaces } from './http.ts';
import {
  listLocationsOperationId,
  type ListLocationsExpectedFailure,
  type ListLocationsInput,
} from './types.ts';

export const listLocationsCellDeclaration = defineOperation<
  ListLocationsInput,
  ListProductionLocationsResult,
  ListLocationsExpectedFailure
>({
  kind: 'query',
  id: listLocationsOperationId,
  authentication: 'required',
  contract: listLocationsContract,
  // Async location-scope lookup is host-owned; the selected HTTP surface
  // consumes the resolved request context without declaring authorization.
  surfaces: listLocationsHttpSurfaces,
  observability: { operation: 'production.list_locations' },
});

export const makeListLocationsCell = (
  dependencies: ListLocationsDependencies,
) =>
  defineOperation(
    listLocationsCellDeclaration,
    makeExecuteListLocations(dependencies),
  );
