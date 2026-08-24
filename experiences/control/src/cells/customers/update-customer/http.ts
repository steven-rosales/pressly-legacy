import type { CustomerMutation } from "../../../management/customers/contracts.ts"
import type { ControlCustomerFailure } from "../../../management/model/failure.ts"
import {
  customerParamsSchema,
  updateCustomerBodySchema,
} from "../../../management/customers/contracts.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import { updateControlCustomerContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const updateSurface = http.patch<
  CustomerMutation,
  ControlCustomerFailure
>({
  path: "/control/customers/:userId",
  bodyLimit: "16kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: { input: invalidRequestDescriptor("body") },
  validateRequest: validateRequest({
    params: customerParamsSchema,
    body: updateCustomerBodySchema,
  }),
  decodeAuthorizationScope: constantAuthorizationScope,
  toSerializedInput: (request) => ({
    context: controlManagementContext(request),
    ...parseRequest(request, "params", customerParamsSchema),
    ...parseRequest(request, "body", updateCustomerBodySchema),
  }),
  present: (outcome) =>
    presentControlManagement(
      outcome,
      updateControlCustomerContract.output.encode,
    ),
})
