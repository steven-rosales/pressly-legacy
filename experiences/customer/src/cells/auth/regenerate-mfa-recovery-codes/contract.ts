import { defineCustomerAuthContract } from '../../../auth/model/boundary-contract.ts';
import {
  identityMutationInputSchema,
  noFailureSchema,
  recoveryCodesSchema,
} from '../../../auth/model/schemas.ts';

export const customerRegenerateMfaRecoveryCodesContract =
  defineCustomerAuthContract({
    label: 'customer.regenerate-mfa-recovery-codes.v1',
    input: identityMutationInputSchema,
    output: recoveryCodesSchema,
    failure: noFailureSchema,
  });
