import type { SessionInventory } from "../../../auth/model/schemas.ts"
import { parsedParams, validateParams } from "../../../auth/model/http.ts"
import { presentControlAdminValue } from "../../../auth/model/presentation.ts"
import { identityInputSchema } from "../../../auth/model/schemas.ts"
import { controlListIdentitySessionsContract } from "./contract.ts"
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

export const listSurface = http.get<SessionInventory, never>({
  path: "/control/auth/identities/:identityId/sessions",
  bodyLimit: "16kb",
  invalidRequest: {
    authorizationScope: invalidParams,
    input: invalidParams,
  },
  validateRequest: validateParams(identityInputSchema),
  decodeAuthorizationScope: identityScope,
  toSerializedInput: (request) => parsedParams(request, identityInputSchema),
  present: (outcome) =>
    presentControlAdminValue(
      outcome,
      controlListIdentitySessionsContract.output.encode,
    ),
})
