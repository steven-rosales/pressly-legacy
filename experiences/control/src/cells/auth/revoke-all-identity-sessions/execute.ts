import type { AccessExecute, AccessInput } from "../../../auth/model/access.ts"
import type { RevokeIdentityInput } from "../../../auth/model/schemas.ts"
import { controlRevokeAllIdentitySessionsCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

const revokeAccessInput = (
  input: RevokeIdentityInput,
): AccessInput<"revokeIdentitySessions"> => ({
  principalIdentityId: input.principalIdentityId,
  identityId: input.identityId,
  ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
})

export const makeControlRevokeAllIdentitySessionsCell = (
  access: AccessExecute<"revokeIdentitySessions">,
) =>
  bindCell(controlRevokeAllIdentitySessionsCellDeclaration, (input) =>
    access.execute(revokeAccessInput(input)),
  )
