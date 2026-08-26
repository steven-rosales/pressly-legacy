import type { AccessExecute, AccessInput } from "../../../auth/model/access.ts"
import type { RemoveMfaInput } from "../../../auth/model/schemas.ts"
import { controlRemoveMfaCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

const removeAccessInput = (
  input: RemoveMfaInput,
): AccessInput<"removeMfa"> => ({
  identityId: input.identityId,
  sessionId: input.sessionId,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
})

export const makeControlRemoveMfaCell = (access: AccessExecute<"removeMfa">) =>
  defineOperation(controlRemoveMfaCellDeclaration, (input) =>
    access.execute(removeAccessInput(input)),
  )
