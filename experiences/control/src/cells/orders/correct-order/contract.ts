import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlOrderFailureSchema } from "../../../management/model/failure.ts"
import {
  correctControlOrderInputSchema,
  orderMutationSchema,
} from "../../../management/orders/contracts.ts"

export const correctControlOrderContract = defineControlManagementContract({
  label: "control.correct-order.v1",
  input: correctControlOrderInputSchema,
  output: orderMutationSchema,
  failure: controlOrderFailureSchema,
})
