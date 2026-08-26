import type {
  ConfirmMfaInput,
  ConfirmMfaFailure,
  RecoveryCodes,
} from "../../../auth/model/schemas.ts"
import { controlConfirmMfaEnrollmentContract } from "./contract.ts"
import { confirmSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const controlConfirmMfaEnrollmentCellDeclaration = defineOperation<
  ConfirmMfaInput,
  RecoveryCodes,
  ConfirmMfaFailure
>({
  kind: "command",
  id: "control.confirm-mfa-enrollment.v1",
  contract: controlConfirmMfaEnrollmentContract,
  authorization: {
    capability: "auth:mfa:enroll",
    timing: "after-input",
    scope: (input) => `auth.identity:${input.identityId}`,
  },
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [confirmSurface],
  observability: { operation: "control.authentication.confirm_mfa_enrollment" },
})
