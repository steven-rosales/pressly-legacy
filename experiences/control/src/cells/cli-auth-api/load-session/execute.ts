import {
  loadCliAuthApiSession,
  type CliAuthApiSessionDependencies,
} from "../../../auth/model/cli-auth-api-session.ts"
import { controlCliAuthApiLoadSessionCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

export const makeControlCliAuthApiLoadSessionCell = (
  dependencies: CliAuthApiSessionDependencies,
) =>
  defineOperation(
    controlCliAuthApiLoadSessionCellDeclaration,
    async (input) => {
      const loaded = await loadCliAuthApiSession(dependencies, {
        accessToken: input.bearerToken,
        revokeOnDenied: true,
      })
      if (loaded.kind === "failure") return loaded
      const { accessToken: _accessToken, ...session } = loaded.value
      return { kind: "success", value: session }
    },
  )
