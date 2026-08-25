import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlOrderOrLocationFailureSchema } from "../../../management/model/failure.ts"
import {
  createControlOrderInputSchema,
  orderMutationSchema,
} from "../../../management/orders/contracts.ts"

export const createControlOrderContract = defineControlManagementContract({
  label: "control.create-order.v1",
  input: createControlOrderInputSchema,
  output: orderMutationSchema,
  failure: controlOrderOrLocationFailureSchema,
})
