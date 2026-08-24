import { defineCustomerAuthContract } from '../../../auth/model/boundary-contract.ts';
import {
  bearerInputSchema,
  logoutOutputSchema,
} from '../../../auth/model/schemas.ts';
import { noFailureSchema } from '../../../auth/model/schemas.ts';

export const customerLogoutContract = defineCustomerAuthContract({
  label: 'customer.logout.v1',
  input: bearerInputSchema,
  output: logoutOutputSchema,
  failure: noFailureSchema,
});
