import { bindCell, declareQueryCell } from '@pressly/cells';
import { listWorkforceContract } from './contract.ts';
import type { ListWorkforce } from './list-workforce.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';

export const listWorkforceCellDeclaration = declareQueryCell<
  OperationInput<ListWorkforce>,
  OperationOutput<ListWorkforce>,
  OperationFailure<ListWorkforce>
>({
  id: 'access.list-workforce.v1',
  authentication: 'required',
  contract: listWorkforceContract,
  consistency: { transaction: 'required', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'identity.list_workforce' },
});

export const makeListWorkforceCell = (operation: ListWorkforce) =>
  bindCell(listWorkforceCellDeclaration, resultOperation(operation));
