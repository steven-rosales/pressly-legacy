import {
  customerMutationSchema,
  updateControlCustomerInputSchema,
} from "../../../management/customers/contracts.ts"
import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlCustomerFailureSchema } from "../../../management/model/failure.ts"

export const updateControlCustomerContract = defineControlManagementContract({
  label: "control.update-customer.v1",
  input: updateControlCustomerInputSchema,
  output: customerMutationSchema,
  failure: controlCustomerFailureSchema,
})
