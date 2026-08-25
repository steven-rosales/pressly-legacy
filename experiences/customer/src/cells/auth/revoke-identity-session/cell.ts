import { bindCell, declareCommandCell } from '@pressly/cells';
import type { AccessExecute } from '../../../auth/model/access.ts';
import {
  type RevokeIdentityInput,
  type RevokedCount,
} from '../../../auth/model/schemas.ts';
import { customerRevokeIdentitySessionContract } from './contract.ts';
import { makeExecuteCustomerRevokeIdentitySession } from './execute.ts';
import { customerRevokeIdentitySessionHttpSurface } from './http.ts';

export const customerRevokeIdentitySessionCellDeclaration = declareCommandCell<
  RevokeIdentityInput,
  RevokedCount,
  never
>({
  id: 'customer.revoke-identity-session.v1',
  contract: customerRevokeIdentitySessionContract,
  authorization: {
    capability: 'auth:session:revoke',
    timing: 'before-input',
  },
  consistency: { transaction: 'none', concurrency: 'none' },
  idempotency: { required: false },
  surfaces: [customerRevokeIdentitySessionHttpSurface],
  observability: {
    operation: 'customer.authentication.revoke_identity_session',
  },
});

export const makeCustomerRevokeIdentitySessionCell = (
  access: AccessExecute<'revokeIdentitySessions'>,
) =>
  bindCell(
    customerRevokeIdentitySessionCellDeclaration,
    makeExecuteCustomerRevokeIdentitySession(access),
  );
