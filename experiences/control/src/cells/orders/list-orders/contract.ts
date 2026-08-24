import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlOrderOrLocationFailureSchema } from "../../../management/model/failure.ts"
import {
  listControlOrdersInputSchema,
  orderListSchema,
} from "../../../management/orders/contracts.ts"

export const listControlOrdersContract = defineControlManagementContract({
  label: "control.list-orders.v1",
  input: listControlOrdersInputSchema,
  output: orderListSchema,
  failure: controlOrderOrLocationFailureSchema,
})
