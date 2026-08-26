import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type { Output } from "./http.ts"
import type { inputSchema } from "./contract.ts"
import { listControlSecurityEventsContract } from "./contract.ts"
import { surface } from "./http.ts"
import { defineOperation } from "@pressly/cells"
import type { z } from "zod"

export type Input = z.output<typeof inputSchema>

export const listControlSecurityEventsCellDeclaration = defineOperation<
  Input,
  Output,
  ControlWorkforceFailure
>({
  kind: "query",
  id: "control.list-security-events.v1",
  contract: listControlSecurityEventsContract,
  authorization: { capability: "security:read", timing: "before-input" },
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [surface],
  observability: { operation: "control.list_security_events" },
})
