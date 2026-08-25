import { defineCustomerAuthContract } from '../../../auth/model/boundary-contract.ts';
import {
  mfaMutationSchema,
  noFailureSchema,
  removeMfaInputSchema,
} from '../../../auth/model/schemas.ts';

export const customerRemoveMfaContract = defineCustomerAuthContract({
  label: 'customer.remove-mfa.v1',
  input: removeMfaInputSchema,
  output: mfaMutationSchema,
  failure: noFailureSchema,
});
