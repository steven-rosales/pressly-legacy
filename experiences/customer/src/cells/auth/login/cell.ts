import { bindCell, declareCommandCell } from '@pressly/cells';
import { customerLoginContract } from './contract.ts';
import {
  makeExecuteCustomerLogin,
  type CustomerLoginDependencies,
} from './execute.ts';
import { customerLoginHttpSurface } from './http.ts';

export const customerLoginCellDeclaration = declareCommandCell({
  id: 'customer.auth-login.v1',
  authentication: 'none',
  contract: customerLoginContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  idempotency: { required: false },
  surfaces: [customerLoginHttpSurface],
  observability: { operation: 'customer.authentication.login' },
});

export const makeCustomerLoginCell = (
  dependencies: CustomerLoginDependencies,
) =>
  bindCell(
    customerLoginCellDeclaration,
    makeExecuteCustomerLogin(dependencies),
  );
