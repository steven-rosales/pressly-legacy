import { declareCommandCell } from "@pressly/cells"
import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type {
  MembershipTransitionInput,
  MembershipTransitionOutput,
} from "../../../management/workforce/contracts.ts"
import { endControlMembershipContract } from "./contract.ts"
import { endSurface } from "./http.ts"

export const endControlMembershipCellDeclaration = declareCommandCell<
  MembershipTransitionInput,
  MembershipTransitionOutput,
  ControlWorkforceFailure
>({
  id: "control.end-membership.v1",
  contract: endControlMembershipContract,
  authorization: { capability: "team:write", timing: "before-input" },
  consistency: {
    transaction: "none",
    concurrency: "optimistic",
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [endSurface],
  observability: { operation: "control_end-membership_v1" },
})
