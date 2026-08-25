import {
  customerReferenceV1CapabilityContract,
  type CustomerReferenceV1Capability,
} from '../contracts/customer-reference-v1.ts';
import { projectCustomerReferenceV1 } from '../model/customer-reference.ts';
import type { ExecuteGetCustomer } from '../cells/profiles/get-customer/execute.ts';

export const makeCustomerReferenceV1Capability = (
  getCustomer: ExecuteGetCustomer,
): CustomerReferenceV1Capability =>
  Object.freeze({
    contract: customerReferenceV1CapabilityContract,
    execute: async (input) => {
      const outcome = await getCustomer({
        businessId: input.businessId,
        userId: input.customerId,
      });
      return outcome.kind === 'success'
        ? projectCustomerReferenceV1(outcome.value)
        : null;
    },
  });
