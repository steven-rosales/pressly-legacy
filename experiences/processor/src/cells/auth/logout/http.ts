import type {
  ProcessorAuthFailure,
  ProcessorLogoutOutput,
} from "../../../server/authentication/model.ts"
import {
  encodeProcessorAuthValue,
  presentProcessorAuth,
  processorLogoutDataSchema,
  processorRequestId,
  processorSessionToken,
} from "../../../server/authentication/model.ts"
import { http } from "@pressly/cells"

export const logoutSurface = http.post<
  ProcessorLogoutOutput,
  ProcessorAuthFailure
>({
  path: "/processor/auth/logout",
  bodyLimit: "64kb",
  contextRequirements: ["processor-session-cookie", "request-metadata"],
  toSerializedInput: (request) => ({
    sessionToken: processorSessionToken(request),
    ...(processorRequestId(request) === undefined
      ? {}
      : { requestId: processorRequestId(request) }),
  }),
  present: (outcome) =>
    presentProcessorAuth(outcome, (data) =>
      encodeProcessorAuthValue(processorLogoutDataSchema, data, "logout")
    ),
})
