import type { CustomerProjection } from "../../../management/customers/contracts.ts"
import type { ControlCustomerFailure } from "../../../management/model/failure.ts"
import { customerParamsSchema } from "../../../management/customers/contracts.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import { getControlCustomerContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const getSurface = http.get<CustomerProjection, ControlCustomerFailure>({
  path: "/control/customers/:userId",
  bodyLimit: "16kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: { input: invalidRequestDescriptor("params") },
  validateRequest: validateRequest({ params: customerParamsSchema }),
  decodeAuthorizationScope: constantAuthorizationScope,
  toSerializedInput: (request) => ({
    context: controlManagementContext(request),
    ...parseRequest(request, "params", customerParamsSchema),
  }),
  present: (outcome) =>
    presentControlManagement(outcome, getControlCustomerContract.output.encode),
})
