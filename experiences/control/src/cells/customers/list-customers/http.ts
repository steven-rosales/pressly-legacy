import type { CustomerList } from "../../../management/customers/contracts.ts"
import type { ControlCustomerFailure } from "../../../management/model/failure.ts"
import { customerListQuerySchema } from "../../../management/customers/contracts.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import { listControlCustomersContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const listSurface = http.get<CustomerList, ControlCustomerFailure>({
  path: "/control/customers",
  bodyLimit: "16kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: { input: invalidRequestDescriptor("query") },
  validateRequest: validateRequest({ query: customerListQuerySchema }),
  decodeAuthorizationScope: constantAuthorizationScope,
  toSerializedInput: (request) => ({
    context: controlManagementContext(request),
    ...parseRequest(request, "query", customerListQuerySchema),
  }),
  present: (outcome) =>
    presentControlManagement(
      outcome,
      listControlCustomersContract.output.encode,
    ),
})
