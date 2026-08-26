import { defineOperation } from '@pressly/cells';
import type { AccessExecute } from '../../../auth/model/access.ts';
import { customerLoadSessionContract } from './contract.ts';
import { makeExecuteCustomerLoadSession } from './execute.ts';
import { customerLoadSessionHttpSurface } from './http.ts';

export const customerLoadSessionCellDeclaration = defineOperation({
  kind: 'query',
  id: 'customer.load-auth-session.v1',
  authentication: 'none',
  contract: customerLoadSessionContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: [customerLoadSessionHttpSurface],
  observability: { operation: 'customer.authentication.load_session' },
});

export const makeCustomerLoadSessionCell = (
  access: AccessExecute<'loadSession'>,
) =>
  defineOperation(
    customerLoadSessionCellDeclaration,
    makeExecuteCustomerLoadSession(access),
  );
