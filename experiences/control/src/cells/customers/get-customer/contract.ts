import {
  customerProjectionSchema,
  getControlCustomerInputSchema,
} from "../../../management/customers/contracts.ts"
import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlCustomerFailureSchema } from "../../../management/model/failure.ts"

export const getControlCustomerContract = defineControlManagementContract({
  label: "control.get-customer.v1",
  input: getControlCustomerInputSchema,
  output: customerProjectionSchema,
  failure: controlCustomerFailureSchema,
})
