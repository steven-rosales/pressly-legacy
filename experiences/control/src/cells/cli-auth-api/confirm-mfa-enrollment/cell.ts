import type {
  ConfirmMfaInput,
  ConfirmMfaFailure,
  RecoveryCodes,
} from "../../../auth/model/schemas.ts"
import { controlCliAuthApiConfirmMfaEnrollmentContract } from "./contract.ts"
import { controlCliAuthApiConfirmMfaEnrollmentSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const controlCliAuthApiConfirmMfaEnrollmentCellDeclaration =
  declareCommandCell<ConfirmMfaInput, RecoveryCodes, ConfirmMfaFailure>({
    id: "control.cli-auth-api-confirm-mfa-enrollment.v1",
    contract: controlCliAuthApiConfirmMfaEnrollmentContract,
    authorization: {
      capability: "auth:mfa:enroll",
      timing: "after-input",
      scope: (input) => `auth.identity:${input.identityId}`,
    },
    consistency: { transaction: "none", concurrency: "none" },
    idempotency: { required: false },
    surfaces: [controlCliAuthApiConfirmMfaEnrollmentSurface],
    observability: {
      operation: "control.cli_auth_api.confirm_mfa_enrollment",
    },
  })
