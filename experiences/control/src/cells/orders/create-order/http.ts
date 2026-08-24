import type { ControlOrderOrLocationFailure } from "../../../management/model/failure.ts"
import type { OrderMutation } from "../../../management/orders/contracts.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  validatedSerializedRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import { createOrderBodySchema } from "../../../management/orders/contracts.ts"
import { createControlOrderContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const createSurface = http.post<
  OrderMutation,
  ControlOrderOrLocationFailure
>({
  path: "/control/orders",
  bodyLimit: "16kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: { input: invalidRequestDescriptor("body") },
  validateRequest: validateRequest({ body: createOrderBodySchema }),
  decodeAuthorizationScope: constantAuthorizationScope,
  toSerializedInput: (request) => ({
    context: controlManagementContext(request),
    ...validatedSerializedRequest(request, "body", createOrderBodySchema),
  }),
  present: (outcome) =>
    presentControlManagement(
      outcome,
      createControlOrderContract.output.encode,
      201,
    ),
})
