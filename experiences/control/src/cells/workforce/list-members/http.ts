import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type { MemberPage } from "../../../management/workforce/contracts.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import { workforceListQuerySchema } from "../../../management/workforce/contracts.ts"
import { listControlMembersContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const listMembersSurface = http.get<MemberPage, ControlWorkforceFailure>(
  {
    path: "/control/team",
    bodyLimit: "16kb",
    contextRequirements: ["control-request-context"],
    invalidRequest: { input: invalidRequestDescriptor("query") },
    validateRequest: validateRequest({ query: workforceListQuerySchema }),
    decodeAuthorizationScope: constantAuthorizationScope,
    toSerializedInput: (request) => {
      const query = parseRequest(request, "query", workforceListQuerySchema)
      const states =
        query.state === undefined
          ? undefined
          : Array.isArray(query.state)
            ? query.state
            : [query.state]
      return {
        context: controlManagementContext(request),
        ...(states === undefined ? {} : { states }),
        ...(query.query === undefined ? {} : { query: query.query }),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        limit: query.limit,
      }
    },
    present: (outcome) =>
      presentControlManagement(
        outcome,
        listControlMembersContract.output.encode,
      ),
  },
)
