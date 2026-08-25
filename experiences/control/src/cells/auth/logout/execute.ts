import type { AccessInput } from "../../../auth/model/access.ts"
import type { Logout } from "../../../auth/model/schemas.ts"
import type { ControlSessionDependencies } from "../../../auth/model/session.ts"
import { loadControlSession } from "../../../auth/model/session.ts"
import { controlLogoutCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

export const makeControlLogoutCell = (
  dependencies: ControlSessionDependencies,
) =>
  bindCell(controlLogoutCellDeclaration, async (input) => {
    const loaded = await loadControlSession(
      dependencies,
      input.sessionToken,
      input.requestId,
    )
    if (loaded.kind === "failure") return loaded
    const command: AccessInput<"revokeSession"> = {
      bearerToken: input.sessionToken,
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    }
    const revoked = await dependencies.revokeSession.execute(command)
    if (revoked.kind === "failure") return revoked
    const data: Logout = { revoked: true }
    return {
      kind: "success",
      value: {
        data,
        setCookieHeaders: [
          ...dependencies.presentation.serializeCookies([
            { action: "clear", cookie: "session" },
            { action: "clear", cookie: "mfa" },
          ]),
        ],
      },
    }
  })
