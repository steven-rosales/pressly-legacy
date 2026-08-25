import type { ControlSessionDependencies } from "../../../auth/model/session.ts"
import { loadControlSession } from "../../../auth/model/session.ts"
import { controlLoadSessionCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

export const makeControlLoadSessionCell = (
  dependencies: ControlSessionDependencies,
) =>
  bindCell(controlLoadSessionCellDeclaration, async (input) => {
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
