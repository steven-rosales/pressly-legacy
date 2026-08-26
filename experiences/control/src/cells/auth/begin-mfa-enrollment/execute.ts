import type { AccessExecute, AccessInput } from "../../../auth/model/access.ts"
import type { BeginMfaInput } from "../../../auth/model/schemas.ts"
import { controlBeginMfaEnrollmentCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

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
  defineOperation(controlBeginMfaEnrollmentCellDeclaration, (input) =>
    access.execute(beginAccessInput(input)),
  )
