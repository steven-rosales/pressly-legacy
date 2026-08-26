import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type {
  RevokeSessionsInput,
  SessionRevocation,
} from "../../../management/workforce/contracts.ts"
import { revokeControlMemberSessionsContract } from "./contract.ts"
import { revokeSessionsSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const writeAuthorization = {
  capability: "team:write",
  timing: "before-input",
} as const

export const revokeControlMemberSessionsCellDeclaration = defineOperation<
  RevokeSessionsInput,
  SessionRevocation,
  ControlWorkforceFailure
>({
  kind: "command",
  id: "control.revoke-member-sessions.v1",
  contract: revokeControlMemberSessionsContract,
  authorization: writeAuthorization,
  consistency: {
    transaction: "none",
    concurrency: "partitioned",
    concurrencyKey: (input) => input.membershipId,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [revokeSessionsSurface],
  observability: { operation: "control.revoke_member_sessions" },
})
