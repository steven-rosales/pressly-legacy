import type { AccessExecute, AccessInput } from "../../../auth/model/access.ts"
import type { ConfirmMfaInput } from "../../../auth/model/schemas.ts"
import { controlConfirmMfaEnrollmentCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

const confirmAccessInput = (
  input: ConfirmMfaInput,
): AccessInput<"confirmMfaEnrollment"> => ({
  identityId: input.identityId,
  sessionId: input.sessionId,
  code: input.code,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
})

export const makeControlConfirmMfaEnrollmentCell = (
  access: AccessExecute<"confirmMfaEnrollment">,
) =>
  defineOperation(controlConfirmMfaEnrollmentCellDeclaration, async (input) => {
    const outcome = await access.execute(confirmAccessInput(input))
    return outcome.kind === "failure"
      ? { kind: "failure", failure: { ...outcome.failure } }
      : {
          kind: "success",
          value: { recoveryCodes: [...outcome.value.recoveryCodes] },
        }
  })
