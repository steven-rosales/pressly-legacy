import type {
  BeginMfaFailure,
  Enrollment,
} from "../../../auth/model/schemas.ts"
import { principalContext, requestId } from "../../../auth/model/http.ts"
import { presentControlAdminAuth } from "../../../auth/model/presentation.ts"
import { controlBeginMfaEnrollmentContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const beginSurface = http.post<Enrollment, BeginMfaFailure>({
  path: "/control/auth/mfa/enrollment",
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
      controlBeginMfaEnrollmentContract.output.encode,
    ),
})
