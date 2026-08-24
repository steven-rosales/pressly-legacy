import type { RevokedCount } from "../../../auth/model/schemas.ts"
import {
  parsedParams,
  principalContext,
  requestId,
  validateParams,
} from "../../../auth/model/http.ts"
import { presentControlAdminValue } from "../../../auth/model/presentation.ts"
import { controlRevokeIdentitySessionContract } from "./contract.ts"
import { http } from "@pressly/cells"
import { z } from "zod"

export const invalidParams = Object.freeze({
  code: "invalid_params_type",
  message: "Validation params failed.",
  location: "params" as const,
})

export const oneSessionParamsSchema = z
  .object({ identityId: z.uuid(), sessionId: z.uuid() })
  .strict()

export const oneSessionScope = http.validatedPathScope({
  schema: oneSessionParamsSchema,
  input: (params) => params,
  scope: (input) => `auth.identity:${input.identityId}`,
})

export const revokeOneSurface = http.post<RevokedCount, never>({
  path: "/control/auth/identities/:identityId/sessions/:sessionId/revoke",
  bodyLimit: "16kb",
  contextRequirements: ["authenticated-principal", "request-metadata"],
  invalidRequest: {
    authorizationScope: invalidParams,
    input: invalidParams,
  },
  validateRequest: validateParams(oneSessionParamsSchema),
  decodeAuthorizationScope: oneSessionScope,
  toSerializedInput: (request) => {
    const params = parsedParams(request, oneSessionParamsSchema)
    return {
      principalIdentityId: principalContext(request).identityId,
      identityId: params.identityId,
      sessionId: params.sessionId,
      ...(requestId(request) === undefined
        ? {}
        : { requestId: requestId(request) }),
    }
  },
  present: (outcome) =>
    presentControlAdminValue(
      outcome,
      controlRevokeIdentitySessionContract.output.encode,
    ),
})
