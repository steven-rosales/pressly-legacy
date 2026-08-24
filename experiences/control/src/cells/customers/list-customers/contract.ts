import {
  customerListSchema,
  listControlCustomersInputSchema,
} from "../../../management/customers/contracts.ts"
import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlCustomerFailureSchema } from "../../../management/model/failure.ts"

export const listControlCustomersContract = defineControlManagementContract({
  label: "control.list-customers.v1",
  input: listControlCustomersInputSchema,
  output: customerListSchema,
  failure: controlCustomerFailureSchema,
})
