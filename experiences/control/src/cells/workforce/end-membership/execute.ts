import { bindCell } from "@pressly/cells"
import type { AccessManagementExecute } from "../../../management/model/dependencies.ts"
import { workforceFailure } from "../../../management/model/failure.ts"
import { projectControlMemberDetail } from "../../../management/workforce/projection.ts"
import { endControlMembershipCellDeclaration } from "./cell.ts"

export const makeEndControlMembershipCell = (
  access: AccessManagementExecute<"transitionWorkforceMembership">,
) =>
  bindCell(endControlMembershipCellDeclaration, async (input) => {
    const outcome = await access.execute({
      actor: input.context.actor,
      businessId: input.context.access.business.id,
      membershipId: input.membershipId,
      expectedVersion: input.expectedVersion,
      event: "end",
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      idempotencyKey: input.idempotencyKey,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: workforceFailure(outcome.failure) }
      : {
          kind: "success",
          value: {
            member: projectControlMemberDetail(outcome.value.member),
            revokedSessionCount: outcome.value.revokedSessionCount,
          },
        }
  })
