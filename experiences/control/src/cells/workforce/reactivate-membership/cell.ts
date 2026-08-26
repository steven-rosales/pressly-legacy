import { defineOperation } from "@pressly/cells"
import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type {
  MembershipTransitionInput,
  MembershipTransitionOutput,
} from "../../../management/workforce/contracts.ts"
import { reactivateControlMembershipContract } from "./contract.ts"
import { reactivateSurface } from "./http.ts"

export const reactivateControlMembershipCellDeclaration = defineOperation<
  MembershipTransitionInput,
  MembershipTransitionOutput,
  ControlWorkforceFailure
>({
  kind: "command",
  id: "control.reactivate-membership.v1",
  contract: reactivateControlMembershipContract,
  authorization: { capability: "team:write", timing: "before-input" },
  consistency: {
    transaction: "none",
    concurrency: "optimistic",
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [reactivateSurface],
  observability: { operation: "control_reactivate-membership_v1" },
})
