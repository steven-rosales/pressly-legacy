import type {
  ConfirmMfaFailure,
  RecoveryCodes,
} from "../../../auth/model/schemas.ts"
import {
  parsedBody,
  principalContext,
  requestId,
  validateBody,
} from "../../../auth/model/http.ts"
import { presentControlAdminAuth } from "../../../auth/model/presentation.ts"
import { confirmBodySchema } from "../../../auth/model/schemas.ts"
import { controlCliAuthApiConfirmMfaEnrollmentContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const controlCliAuthApiConfirmMfaEnrollmentInvalidBody = Object.freeze({
  code: "invalid_body_type",
  message: "Validation body failed.",
  location: "body" as const,
})

export const controlCliAuthApiConfirmMfaEnrollmentSurface = http.post<
  RecoveryCodes,
  ConfirmMfaFailure
>({
  path: "/control/cli/auth/mfa/enrollment/confirm",
  bodyLimit: "16kb",
  contextRequirements: ["authenticated-principal", "request-metadata"],
  invalidRequest: { input: controlCliAuthApiConfirmMfaEnrollmentInvalidBody },
  validateRequest: validateBody(confirmBodySchema),
  toSerializedInput: (request) => {
    const principal = principalContext(request)
    const body = parsedBody(request, confirmBodySchema)
    return {
      identityId: principal.identityId,
      sessionId: principal.sessionId,
      code: body.code,
      ...(requestId(request) === undefined
        ? {}
        : { requestId: requestId(request) }),
    }
  },
  present: (outcome) =>
    presentControlAdminAuth(
      outcome,
      controlCliAuthApiConfirmMfaEnrollmentContract.output.encode,
    ),
})
