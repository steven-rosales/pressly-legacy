import type { ControlSessionDependencies } from "../../../auth/model/session.ts"
import { loadControlSession } from "../../../auth/model/session.ts"
import { controlLoadSessionCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

export const makeControlLoadSessionCell = (
  dependencies: ControlSessionDependencies,
) =>
  defineOperation(controlLoadSessionCellDeclaration, async (input) => {
    const loaded = await loadControlSession(
      dependencies,
      input.sessionToken,
      input.requestId,
    )
    return loaded.kind === "failure"
      ? loaded
      : {
          kind: "success",
          value: { data: loaded.session, setCookieHeaders: [] },
        }
  })
