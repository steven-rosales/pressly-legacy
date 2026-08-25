import type { ControlOrderFailure } from "../../../management/model/failure.ts"
import type { OrderDetail } from "../../../management/orders/contracts.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import { orderParamsSchema } from "../../../management/orders/contracts.ts"
import { getControlOrderContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const getSurface = http.get<OrderDetail, ControlOrderFailure>({
  path: "/control/orders/:orderId",
  bodyLimit: "16kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: { input: invalidRequestDescriptor("params") },
  validateRequest: validateRequest({ params: orderParamsSchema }),
  decodeAuthorizationScope: constantAuthorizationScope,
  toSerializedInput: (request) => ({
    context: controlManagementContext(request),
    ...parseRequest(request, "params", orderParamsSchema),
  }),
  present: (outcome) =>
    presentControlManagement(outcome, getControlOrderContract.output.encode),
})
