import { defineOperation } from '@pressly/cells';
import type { AccessExecute } from '../../../auth/model/access.ts';
import {
  type RevokeIdentityInput,
  type RevokedCount,
} from '../../../auth/model/schemas.ts';
import { customerRevokeAllIdentitySessionsContract } from './contract.ts';
import { makeExecuteCustomerRevokeAllIdentitySessions } from './execute.ts';
import { customerRevokeAllIdentitySessionsHttpSurface } from './http.ts';

export const customerRevokeAllIdentitySessionsCellDeclaration = defineOperation<
  RevokeIdentityInput,
  RevokedCount,
  never
>({
  kind: 'command',
  id: 'customer.revoke-all-identity-sessions.v1',
  contract: customerRevokeAllIdentitySessionsContract,
  authorization: {
    capability: 'auth:session:revoke',
    timing: 'before-input',
  },
  consistency: { transaction: 'none', concurrency: 'none' },
  idempotency: { required: false },
  surfaces: [customerRevokeAllIdentitySessionsHttpSurface],
  observability: {
    operation: 'customer.authentication.revoke_all_identity_sessions',
  },
});

export const makeCustomerRevokeAllIdentitySessionsCell = (
  access: AccessExecute<'revokeIdentitySessions'>,
) =>
  defineOperation(
    customerRevokeAllIdentitySessionsCellDeclaration,
    makeExecuteCustomerRevokeAllIdentitySessions(access),
  );
