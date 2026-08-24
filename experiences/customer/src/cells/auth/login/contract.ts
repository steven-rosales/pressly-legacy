import { defineCustomerAuthContract } from '../../../auth/model/boundary-contract.ts';
import {
  loginFailureSchema,
  loginInputSchema,
  loginOutputSchema,
} from '../../../auth/model/schemas.ts';

export const customerLoginContract = defineCustomerAuthContract({
  label: 'customer.auth-login.v1',
  input: loginInputSchema,
  output: loginOutputSchema,
  failure: loginFailureSchema,
});
