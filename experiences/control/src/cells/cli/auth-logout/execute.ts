import type { AdminCliAuthDependencies } from "../../../cli/auth-dependencies.ts"
import { adminCliAuthLogoutCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

export const makeAdminCliAuthLogoutCell = (
  dependencies: AdminCliAuthDependencies,
) =>
  bindCell(adminCliAuthLogoutCellDeclaration, async (input) => {
    void input
    const loaded = await dependencies.session.read()
    if (loaded.kind === "failure") return loaded
    if (loaded.value !== undefined) {
      const revoked = await dependencies.api.logout(loaded.value.accessToken)
      if (revoked.kind === "failure") return revoked
    }
    const cleared = await dependencies.session.clear()
    return cleared.kind === "failure"
      ? cleared
      : { kind: "success", value: { revoked: true } }
  })
