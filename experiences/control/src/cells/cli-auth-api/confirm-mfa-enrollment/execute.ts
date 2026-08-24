import type { AccessExecute, AccessInput } from "../../../auth/model/access.ts"
import type { ConfirmMfaInput } from "../../../auth/model/schemas.ts"
import { controlCliAuthApiConfirmMfaEnrollmentCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

const confirmAccessInput = (
  input: ConfirmMfaInput,
): AccessInput<"confirmMfaEnrollment"> => ({
  identityId: input.identityId,
  sessionId: input.sessionId,
  code: input.code,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
})

export const makeControlCliAuthApiConfirmMfaEnrollmentCell = (
  access: AccessExecute<"confirmMfaEnrollment">,
) =>
  bindCell(
    controlCliAuthApiConfirmMfaEnrollmentCellDeclaration,
    async (input) => {
      const outcome = await access.execute(confirmAccessInput(input))
      return outcome.kind === "failure"
        ? { kind: "failure", failure: { ...outcome.failure } }
        : {
            kind: "success",
            value: { recoveryCodes: [...outcome.value.recoveryCodes] },
          }
    },
  )
