import type {
  BeginMfaFailure,
  BeginMfaInput,
  Enrollment,
} from "../../../auth/model/schemas.ts"
import { controlCliAuthApiBeginMfaEnrollmentContract } from "./contract.ts"
import { controlCliAuthApiBeginMfaEnrollmentSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const controlCliAuthApiBeginMfaEnrollmentCellDeclaration =
  declareCommandCell<BeginMfaInput, Enrollment, BeginMfaFailure>({
    id: "control.cli-auth-api-begin-mfa-enrollment.v1",
    contract: controlCliAuthApiBeginMfaEnrollmentContract,
    authorization: {
      capability: "auth:mfa:enroll",
      timing: "after-input",
      scope: (input) => `auth.identity:${input.identityId}`,
    },
    consistency: { transaction: "none", concurrency: "none" },
    idempotency: { required: false },
    surfaces: [controlCliAuthApiBeginMfaEnrollmentSurface],
    observability: {
      operation: "control.cli_auth_api.begin_mfa_enrollment",
    },
  })
