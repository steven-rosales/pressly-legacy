import type {
  ProcessorAuthFailure,
  ProcessorLoginOutput,
} from "../../../server/authentication/model.ts"
import {
  encodeProcessorAuthValue,
  parsedProcessorAuthBody,
  presentProcessorAuth,
  processorLoginBodySchema,
  processorLoginDataSchema,
  processorRequestMetadata,
  validateProcessorAuthBody,
} from "../../../server/authentication/model.ts"
import { http } from "@pressly/cells"

export const invalidBody = Object.freeze({
  code: "invalid_body_type",
  message: "Validation body failed.",
  location: "body" as const,
})

export const loginSurface = http.post<
  ProcessorLoginOutput,
  ProcessorAuthFailure
>({
  path: "/processor/auth/login",
  bodyLimit: "8kb",
  contextRequirements: ["request-metadata"],
  invalidRequest: { input: invalidBody },
  validateRequest: validateProcessorAuthBody(processorLoginBodySchema),
  toSerializedInput: (request) => ({
    ...parsedProcessorAuthBody(request, processorLoginBodySchema),
    ...processorRequestMetadata(request),
  }),
  present: (outcome) =>
    presentProcessorAuth(outcome, (data) =>
      encodeProcessorAuthValue(processorLoginDataSchema, data, "login")
    ),
})
