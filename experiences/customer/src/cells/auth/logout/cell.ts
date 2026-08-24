import { bindCell, declareCommandCell } from '@pressly/cells';
import type { AccessExecute } from '../../../auth/model/access.ts';
import {
  type BearerInput,
  type LogoutOutput,
} from '../../../auth/model/schemas.ts';
import { customerLogoutContract } from './contract.ts';
import { makeExecuteCustomerLogout } from './execute.ts';
import { customerLogoutHttpSurface } from './http.ts';

export const customerLogoutCellDeclaration = declareCommandCell<
  BearerInput,
  LogoutOutput,
  never
>({
  id: 'customer.logout.v1',
  authentication: 'none',
  contract: customerLogoutContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  idempotency: { required: false },
  surfaces: [customerLogoutHttpSurface],
  observability: { operation: 'customer.authentication.logout' },
});

export const makeCustomerLogoutCell = (
  access: AccessExecute<'revokeSession'>,
) => bindCell(customerLogoutCellDeclaration, makeExecuteCustomerLogout(access));
