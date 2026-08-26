import type { AccessManagementExecute } from "../../../management/model/dependencies.ts"
import { workforceFailure } from "../../../management/model/failure.ts"
import { listControlSecurityEventsCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

export const makeListControlSecurityEventsCell = (
  access: AccessManagementExecute<"listWorkforceSecurityEvents">,
) =>
  defineOperation(listControlSecurityEventsCellDeclaration, async (input) => {
    const outcome = await access.execute({
      actor: input.context.actor,
      businessId: input.context.access.business.id,
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      limit: input.limit,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: workforceFailure(outcome.failure) }
      : {
          kind: "success",
          value: {
            events: outcome.value.events.map((event) => ({ ...event })),
            nextCursor: outcome.value.nextCursor,
          },
        }
  })
