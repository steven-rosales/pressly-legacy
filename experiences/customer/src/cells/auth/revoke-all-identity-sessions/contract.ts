import { defineCustomerAuthContract } from '../../../auth/model/boundary-contract.ts';
import {
  noFailureSchema,
  revokeIdentityInputSchema,
  revokedCountSchema,
} from '../../../auth/model/schemas.ts';

export const customerRevokeAllIdentitySessionsContract =
  defineCustomerAuthContract({
    label: 'customer.revoke-all-identity-sessions.v1',
    input: revokeIdentityInputSchema,
    output: revokedCountSchema,
    failure: noFailureSchema,
  });
