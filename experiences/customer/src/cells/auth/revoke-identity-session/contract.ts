import { defineCustomerAuthContract } from '../../../auth/model/boundary-contract.ts';
import {
  noFailureSchema,
  revokeIdentityInputSchema,
  revokedCountSchema,
} from '../../../auth/model/schemas.ts';

export const customerRevokeIdentitySessionContract = defineCustomerAuthContract(
  {
    label: 'customer.revoke-identity-session.v1',
    input: revokeIdentityInputSchema,
    output: revokedCountSchema,
    failure: noFailureSchema,
  },
);
