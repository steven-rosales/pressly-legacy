import type { AccessExecute, AccessInput } from "../../../auth/model/access.ts"
import type { RevokeIdentityInput } from "../../../auth/model/schemas.ts"
import { controlRevokeIdentitySessionCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

const revokeAccessInput = (
  input: RevokeIdentityInput,
): AccessInput<"revokeIdentitySessions"> => ({
  principalIdentityId: input.principalIdentityId,
  identityId: input.identityId,
  ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
})

export const makeControlRevokeIdentitySessionCell = (
  access: AccessExecute<"revokeIdentitySessions">,
) =>
  defineOperation(controlRevokeIdentitySessionCellDeclaration, (input) =>
    access.execute(revokeAccessInput(input)),
  )
