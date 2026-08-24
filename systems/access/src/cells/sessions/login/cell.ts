import { bindCell, declareCommandCell } from '@pressly/cells';
import { loginContract } from './contract.ts';
import type { Login } from './login.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const loginCellDeclaration = declareCommandCell<
  OperationInput<Login>,
  OperationOutput<Login>,
  OperationFailure<Login>
>({
  id: 'access.login.v1',
  authentication: 'none',
  contract: loginContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  idempotency: { required: false },
  surfaces: [],
  observability: { operation: 'identity.login' },
});

export const makeLoginCell = (operation: Login) =>
  bindCell(loginCellDeclaration, resultOperation(operation));
