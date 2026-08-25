import type { AccessExecute } from "../../../auth/model/access.ts"
import { controlListIdentitySessionsCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

export const makeControlListIdentitySessionsCell = (
  access: AccessExecute<"listIdentitySessions">,
) =>
  bindCell(controlListIdentitySessionsCellDeclaration, async (input) => {
    const outcome = await access.execute(input.identityId)
    return outcome.kind === "failure"
      ? outcome
      : {
          kind: "success",
          value: {
            sessions: outcome.value.sessions.map((session) => ({ ...session })),
          },
        }
  })
