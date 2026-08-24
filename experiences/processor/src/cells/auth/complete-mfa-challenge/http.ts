import type {
  ProcessorAuthFailure,
  ProcessorSessionOutput,
} from "../../../server/authentication/model.ts"
import {
  encodeProcessorAuthValue,
  parsedProcessorAuthBody,
  presentProcessorAuth,
  processorChallengeBodySchema,
  processorChallengeToken,
  processorRequestId,
  processorSessionSchema,
  validateProcessorAuthBody,
} from "../../../server/authentication/model.ts"
import { http } from "@pressly/cells"

export const invalidBody = Object.freeze({
  code: "invalid_body_type",
  message: "Validation body failed.",
  location: "body" as const,
})

export const challengeSurface = http.post<
  ProcessorSessionOutput,
  ProcessorAuthFailure
>({
  path: "/processor/auth/mfa/challenge",
  bodyLimit: "4kb",
  contextRequirements: ["processor-mfa-cookie", "request-metadata"],
  invalidRequest: { input: invalidBody },
  validateRequest: validateProcessorAuthBody(processorChallengeBodySchema),
  toSerializedInput: (request) => ({
    ...parsedProcessorAuthBody(request, processorChallengeBodySchema),
    challengeToken: processorChallengeToken(request),
    ...(processorRequestId(request) === undefined
      ? {}
      : { requestId: processorRequestId(request) }),
  }),
  present: (outcome) =>
    presentProcessorAuth(outcome, (data) =>
      encodeProcessorAuthValue(processorSessionSchema, data, "MFA challenge")
    ),
})
