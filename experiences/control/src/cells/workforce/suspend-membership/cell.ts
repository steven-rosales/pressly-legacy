import { declareCommandCell } from "@pressly/cells"
import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type {
  MembershipTransitionInput,
  MembershipTransitionOutput,
} from "../../../management/workforce/contracts.ts"
import { suspendControlMembershipContract } from "./contract.ts"
import { suspendSurface } from "./http.ts"

export const suspendControlMembershipCellDeclaration = declareCommandCell<
  MembershipTransitionInput,
  MembershipTransitionOutput,
  ControlWorkforceFailure
>({
  id: "control.suspend-membership.v1",
  contract: suspendControlMembershipContract,
  authorization: { capability: "team:write", timing: "before-input" },
  consistency: {
    transaction: "none",
    concurrency: "optimistic",
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [suspendSurface],
  observability: { operation: "control_suspend-membership_v1" },
})
