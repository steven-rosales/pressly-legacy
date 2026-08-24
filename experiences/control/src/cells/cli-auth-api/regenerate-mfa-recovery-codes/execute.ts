import type { AccessExecute, AccessInput } from "../../../auth/model/access.ts"
import type { IdentityMutationInput } from "../../../auth/model/schemas.ts"
import { controlCliAuthApiRegenerateMfaRecoveryCodesCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

const mutationAccessInput = (
  input: IdentityMutationInput,
): AccessInput<"regenerateMfaRecoveryCodes"> => ({
  identityId: input.identityId,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
})

export const makeControlCliAuthApiRegenerateMfaRecoveryCodesCell = (
  access: AccessExecute<"regenerateMfaRecoveryCodes">,
) =>
  bindCell(
    controlCliAuthApiRegenerateMfaRecoveryCodesCellDeclaration,
    async (input) => {
      const outcome = await access.execute(mutationAccessInput(input))
      return outcome.kind === "failure"
        ? outcome
        : {
            kind: "success",
            value: { recoveryCodes: [...outcome.value.recoveryCodes] },
          }
    },
  )
