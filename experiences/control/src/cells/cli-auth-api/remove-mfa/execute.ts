import type { AccessExecute, AccessInput } from "../../../auth/model/access.ts"
import type { RemoveMfaInput } from "../../../auth/model/schemas.ts"
import { controlCliAuthApiRemoveMfaCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

const removeAccessInput = (
  input: RemoveMfaInput,
): AccessInput<"removeMfa"> => ({
  identityId: input.identityId,
  sessionId: input.sessionId,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
})

export const makeControlCliAuthApiRemoveMfaCell = (
  access: AccessExecute<"removeMfa">,
) =>
  bindCell(controlCliAuthApiRemoveMfaCellDeclaration, (input) =>
    access.execute(removeAccessInput(input)),
  )
