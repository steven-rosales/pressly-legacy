import type { ControlOrderFailure } from "../../../management/model/failure.ts"
import type { OrderMutation } from "../../../management/orders/contracts.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validatedSerializedRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import {
  correctOrderBodySchema,
  orderParamsSchema,
} from "../../../management/orders/contracts.ts"
import { correctControlOrderContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const correctSurface = http.patch<OrderMutation, ControlOrderFailure>({
  path: "/control/orders/:orderId",
  bodyLimit: "16kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: { input: invalidRequestDescriptor("body") },
  validateRequest: validateRequest({
    params: orderParamsSchema,
    body: correctOrderBodySchema,
  }),
  decodeAuthorizationScope: constantAuthorizationScope,
  toSerializedInput: (request) => ({
    context: controlManagementContext(request),
    ...parseRequest(request, "params", orderParamsSchema),
    ...validatedSerializedRequest(request, "body", correctOrderBodySchema),
  }),
  present: (outcome) =>
    presentControlManagement(
      outcome,
      correctControlOrderContract.output.encode,
    ),
})
