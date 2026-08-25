import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type {
  MemberInput,
  SessionList,
} from "../../../management/workforce/contracts.ts"
import { listControlMemberSessionsContract } from "./contract.ts"
import { listSessionsSurface } from "./http.ts"
import { declareQueryCell } from "@pressly/cells"

export const readAuthorization = {
  capability: "team:read",
  timing: "before-input",
} as const

export const listControlMemberSessionsCellDeclaration = declareQueryCell<
  MemberInput,
  SessionList,
  ControlWorkforceFailure
>({
  id: "control.list-member-sessions.v1",
  contract: listControlMemberSessionsContract,
  authorization: readAuthorization,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [listSessionsSurface],
  observability: { operation: "control.list_member_sessions" },
})
