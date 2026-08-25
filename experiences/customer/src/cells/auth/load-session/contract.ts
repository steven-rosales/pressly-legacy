import { defineCustomerAuthContract } from '../../../auth/model/boundary-contract.ts';
import {
  bearerInputSchema,
  loadSessionFailureSchema,
  sessionOutputSchema,
} from '../../../auth/model/schemas.ts';

export const customerLoadSessionContract = defineCustomerAuthContract({
  label: 'customer.load-auth-session.v1',
  input: bearerInputSchema.omit({ requestId: true }),
  output: sessionOutputSchema,
  failure: loadSessionFailureSchema,
});
