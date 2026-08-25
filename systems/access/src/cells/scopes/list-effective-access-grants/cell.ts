import { bindCell, declareQueryCell } from '@pressly/cells';
import {
  successOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import { listEffectiveAccessGrantsContract } from './contract.ts';
import type { ListEffectiveAccessGrants } from './list-effective-access-grants.usecase.ts';

export const listEffectiveAccessGrantsCellDeclaration = declareQueryCell<
  OperationInput<ListEffectiveAccessGrants>,
  OperationOutput<ListEffectiveAccessGrants>,
  OperationFailure<ListEffectiveAccessGrants>
>({
  id: 'access.list-effective-access-grants.v1',
  authentication: 'required',
  contract: listEffectiveAccessGrantsContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'access.list_effective_access_grants' },
});

export const makeListEffectiveAccessGrantsCell = (
  operation: ListEffectiveAccessGrants,
) =>
  bindCell(
    listEffectiveAccessGrantsCellDeclaration,
    successOperation(operation),
  );
