import type {
  BeginMfaFailure,
  Enrollment,
} from "../../../auth/model/schemas.ts"
import { principalContext, requestId } from "../../../auth/model/http.ts"
import { presentControlAdminAuth } from "../../../auth/model/presentation.ts"
import { controlCliAuthApiBeginMfaEnrollmentContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const controlCliAuthApiBeginMfaEnrollmentSurface = http.post<
  Enrollment,
  BeginMfaFailure
>({
  path: "/control/cli/auth/mfa/enrollment",
  bodyLimit: "16kb",
  contextRequirements: ["authenticated-principal", "request-metadata"],
  toSerializedInput: (request) => {
    const principal = principalContext(request)
    return {
      identityId: principal.identityId,
      label: principal.label,
      ...(requestId(request) === undefined
        ? {}
        : { requestId: requestId(request) }),
    }
  },
  present: (outcome) =>
    presentControlAdminAuth(
      outcome,
      controlCliAuthApiBeginMfaEnrollmentContract.output.encode,
    ),
})
