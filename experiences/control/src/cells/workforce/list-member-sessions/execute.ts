import type { AccessManagementExecute } from "../../../management/model/dependencies.ts"
import { workforceFailure } from "../../../management/model/failure.ts"
import { listControlMemberSessionsCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

export const makeListControlMemberSessionsCell = (
  access: AccessManagementExecute<"listWorkforceMemberSessions">,
) =>
  bindCell(listControlMemberSessionsCellDeclaration, async (input) => {
    const outcome = await access.execute({
      actor: input.context.actor,
      businessId: input.context.access.business.id,
      membershipId: input.membershipId,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: workforceFailure(outcome.failure) }
      : {
          kind: "success",
          value: {
            sessions: outcome.value.sessions.map((item) => ({ ...item })),
          },
        }
  })
