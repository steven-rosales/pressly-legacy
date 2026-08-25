import type { ControlOrderOrLocationFailure } from "../../../management/model/failure.ts"
import type { OrderList } from "../../../management/orders/contracts.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import { orderListQuerySchema } from "../../../management/orders/contracts.ts"
import { listControlOrdersContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const listSurface = http.get<OrderList, ControlOrderOrLocationFailure>({
  path: "/control/orders",
  bodyLimit: "16kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: { input: invalidRequestDescriptor("query") },
  validateRequest: validateRequest({ query: orderListQuerySchema }),
  decodeAuthorizationScope: constantAuthorizationScope,
  toSerializedInput: (request) => ({
    context: controlManagementContext(request),
    ...parseRequest(request, "query", orderListQuerySchema),
  }),
  present: (outcome) =>
    presentControlManagement(outcome, listControlOrdersContract.output.encode),
})
