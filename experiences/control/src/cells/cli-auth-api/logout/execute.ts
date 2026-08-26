import type { AccessExecute, AccessInput } from "../../../auth/model/access.ts"
import type { CliAuthApiTokenInput } from "../../../auth/model/cli-auth-api.ts"
import { controlCliAuthApiLogoutCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

const accessInput = (
  input: CliAuthApiTokenInput,
): AccessInput<"revokeSession"> => ({
  bearerToken: input.bearerToken,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
})

export const makeControlCliAuthApiLogoutCell = (
  revokeSession: AccessExecute<"revokeSession">,
) =>
  defineOperation(controlCliAuthApiLogoutCellDeclaration, (input) =>
    revokeSession.execute(accessInput(input)),
  )
