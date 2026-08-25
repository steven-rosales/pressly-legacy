import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import type { securityEventListSchema } from "./contract.ts"
import { listControlSecurityEventsContract } from "./contract.ts"
import { http } from "@pressly/cells"
import { z } from "zod"

export const securityEventQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(1000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()

export type Output = z.output<typeof securityEventListSchema>

export const surface = http.get<Output, ControlWorkforceFailure>({
  path: "/control/security/events",
  bodyLimit: "16kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: { input: invalidRequestDescriptor("query") },
  validateRequest: validateRequest({ query: securityEventQuerySchema }),
  decodeAuthorizationScope: constantAuthorizationScope,
  toSerializedInput: (request) => ({
    context: controlManagementContext(request),
    ...parseRequest(request, "query", securityEventQuerySchema),
  }),
  present: (outcome) =>
    presentControlManagement(
      outcome,
      listControlSecurityEventsContract.output.encode,
    ),
})
