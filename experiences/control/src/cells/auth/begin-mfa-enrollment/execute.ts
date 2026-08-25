import type { AccessExecute, AccessInput } from "../../../auth/model/access.ts"
import type { BeginMfaInput } from "../../../auth/model/schemas.ts"
import { controlBeginMfaEnrollmentCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

const beginAccessInput = (
  input: BeginMfaInput,
): AccessInput<"beginMfaEnrollment"> => ({
  identityId: input.identityId,
  label: input.label,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
})

export const makeControlBeginMfaEnrollmentCell = (
  access: AccessExecute<"beginMfaEnrollment">,
) =>
  bindCell(controlBeginMfaEnrollmentCellDeclaration, (input) =>
    access.execute(beginAccessInput(input)),
  )
