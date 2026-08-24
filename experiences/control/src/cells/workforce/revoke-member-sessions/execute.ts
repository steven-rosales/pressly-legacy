import type { AccessManagementExecute } from "../../../management/model/dependencies.ts"
import { workforceFailure } from "../../../management/model/failure.ts"
import { revokeControlMemberSessionsCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

export const makeRevokeControlMemberSessionsCell = (
  access: AccessManagementExecute<"revokeWorkforceMemberSessions">,
) =>
  bindCell(revokeControlMemberSessionsCellDeclaration, async (input) => {
    const outcome = await access.execute({
      actor: input.context.actor,
      businessId: input.context.access.business.id,
      membershipId: input.membershipId,
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      idempotencyKey: input.idempotencyKey,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: workforceFailure(outcome.failure) }
      : { kind: "success", value: outcome.value }
  })
