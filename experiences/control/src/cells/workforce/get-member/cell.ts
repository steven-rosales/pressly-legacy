import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type {
  MemberDetail,
  MemberInput,
} from "../../../management/workforce/contracts.ts"
import { getControlMemberContract } from "./contract.ts"
import { getMemberSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const readAuthorization = {
  capability: "team:read",
  timing: "before-input",
} as const

export const getControlMemberCellDeclaration = defineOperation<
  MemberInput,
  MemberDetail,
  ControlWorkforceFailure
>({
  kind: "query",
  id: "control.get-member.v1",
  contract: getControlMemberContract,
  authorization: readAuthorization,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [getMemberSurface],
  observability: { operation: "control.get_member" },
})
