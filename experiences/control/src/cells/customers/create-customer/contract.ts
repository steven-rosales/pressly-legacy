import {
  createControlCustomerInputSchema,
  customerMutationSchema,
} from "../../../management/customers/contracts.ts"
import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlCustomerFailureSchema } from "../../../management/model/failure.ts"

export const createControlCustomerContract = defineControlManagementContract({
  label: "control.create-customer.v1",
  input: createControlCustomerInputSchema,
  output: customerMutationSchema,
  failure: controlCustomerFailureSchema,
})
