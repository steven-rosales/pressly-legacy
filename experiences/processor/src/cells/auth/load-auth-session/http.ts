import type {
  ProcessorAuthFailure,
  ProcessorSessionOutput,
} from "../../../server/authentication/model.ts"
import {
  encodeProcessorAuthValue,
  presentProcessorAuth,
  processorRequestId,
  processorSessionSchema,
  processorSessionToken,
} from "../../../server/authentication/model.ts"
import { http } from "@pressly/cells"

export const sessionSurface = http.get<
  ProcessorSessionOutput,
  ProcessorAuthFailure
>({
  path: "/processor/auth/session",
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
      encodeProcessorAuthValue(processorSessionSchema, data, "session")
    ),
})
