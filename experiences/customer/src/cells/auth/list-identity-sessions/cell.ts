import { defineOperation } from '@pressly/cells';
import type { AccessExecute } from '../../../auth/model/access.ts';
import {
  type IdentityInput,
  type SessionInventory,
} from '../../../auth/model/schemas.ts';
import { customerListIdentitySessionsContract } from './contract.ts';
import { makeExecuteCustomerListIdentitySessions } from './execute.ts';
import { customerListIdentitySessionsHttpSurface } from './http.ts';

export const customerListIdentitySessionsCellDeclaration = defineOperation<
  IdentityInput,
  SessionInventory,
  never
>({
  kind: 'query',
  id: 'customer.list-identity-sessions.v1',
  contract: customerListIdentitySessionsContract,
  authorization: {
    capability: 'auth:session:read',
    timing: 'before-input',
  },
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: [customerListIdentitySessionsHttpSurface],
  observability: {
    operation: 'customer.authentication.list_identity_sessions',
  },
});

export const makeCustomerListIdentitySessionsCell = (
  access: AccessExecute<'listIdentitySessions'>,
) =>
  defineOperation(
    customerListIdentitySessionsCellDeclaration,
    makeExecuteCustomerListIdentitySessions(access),
  );
