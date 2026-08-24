import type { CustomerMutation } from "../../../management/customers/contracts.ts"
import type { ControlCustomerFailure } from "../../../management/model/failure.ts"
import { createCustomerBodySchema } from "../../../management/customers/contracts.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import { createControlCustomerContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const createSurface = http.post<
  CustomerMutation,
  ControlCustomerFailure
>({
  path: "/control/customers",
  bodyLimit: "16kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: { input: invalidRequestDescriptor("body") },
  validateRequest: validateRequest({ body: createCustomerBodySchema }),
  decodeAuthorizationScope: constantAuthorizationScope,
  toSerializedInput: (request) => ({
    context: controlManagementContext(request),
    ...parseRequest(request, "body", createCustomerBodySchema),
  }),
  present: (outcome) =>
    presentControlManagement(
      outcome,
      createControlCustomerContract.output.encode,
      201,
    ),
})
