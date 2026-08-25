import type {
  BeginMfaFailure,
  BeginMfaInput,
  Enrollment,
} from "../../../auth/model/schemas.ts"
import { controlBeginMfaEnrollmentContract } from "./contract.ts"
import { beginSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const controlBeginMfaEnrollmentCellDeclaration = declareCommandCell<
  BeginMfaInput,
  Enrollment,
  BeginMfaFailure
>({
  id: "control.begin-mfa-enrollment.v1",
  contract: controlBeginMfaEnrollmentContract,
  authorization: {
    capability: "auth:mfa:enroll",
    timing: "after-input",
    scope: (input) => `auth.identity:${input.identityId}`,
  },
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [beginSurface],
  observability: { operation: "control.authentication.begin_mfa_enrollment" },
})
