import type { RevokedCount } from "../../../auth/model/schemas.ts"
import {
  parsedParams,
  principalContext,
  requestId,
  validateParams,
} from "../../../auth/model/http.ts"
import { presentControlAdminValue } from "../../../auth/model/presentation.ts"
import { identityInputSchema } from "../../../auth/model/schemas.ts"
import { controlRevokeAllIdentitySessionsContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const invalidParams = Object.freeze({
  code: "invalid_params_type",
  message: "Validation params failed.",
  location: "params" as const,
})

export const identityScope = http.validatedPathScope({
  schema: identityInputSchema,
  input: (params) => params,
  scope: (input) => `auth.identity:${input.identityId}`,
})

export const revokeAllSurface = http.post<RevokedCount, never>({
  path: "/control/auth/identities/:identityId/sessions/revoke-all",
  bodyLimit: "16kb",
  contextRequirements: ["authenticated-principal", "request-metadata"],
  invalidRequest: {
    authorizationScope: invalidParams,
    input: invalidParams,
  },
  validateRequest: validateParams(identityInputSchema),
  decodeAuthorizationScope: identityScope,
  toSerializedInput: (request) => {
    const params = parsedParams(request, identityInputSchema)
    return {
      principalIdentityId: principalContext(request).identityId,
      identityId: params.identityId,
      ...(requestId(request) === undefined
        ? {}
        : { requestId: requestId(request) }),
    }
  },
  present: (outcome) =>
    presentControlAdminValue(
      outcome,
      controlRevokeAllIdentitySessionsContract.output.encode,
    ),
})
