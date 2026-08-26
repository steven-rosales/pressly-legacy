import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type {
  ListMembersInput,
  MemberPage,
} from "../../../management/workforce/contracts.ts"
import { listControlMembersContract } from "./contract.ts"
import { listMembersSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const readAuthorization = {
  capability: "team:read",
  timing: "before-input",
} as const

export const listControlMembersCellDeclaration = defineOperation<
  ListMembersInput,
  MemberPage,
  ControlWorkforceFailure
>({
  kind: "query",
  id: "control.list-members.v1",
  contract: listControlMembersContract,
  authorization: readAuthorization,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [listMembersSurface],
  observability: { operation: "control.list_members" },
})
