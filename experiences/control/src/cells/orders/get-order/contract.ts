import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlOrderFailureSchema } from "../../../management/model/failure.ts"
import {
  getControlOrderInputSchema,
  orderDetailSchema,
} from "../../../management/orders/contracts.ts"

export const getControlOrderContract = defineControlManagementContract({
  label: "control.get-order.v1",
  input: getControlOrderInputSchema,
  output: orderDetailSchema,
  failure: controlOrderFailureSchema,
})
