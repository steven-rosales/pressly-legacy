import {
  parsedBody,
  requestId,
  validateBody,
} from "../../../auth/model/http.ts"
import { presentControlAdminAuth } from "../../../auth/model/presentation.ts"
import { cliAuthApiChallengeBodySchema } from "../../../auth/model/cli-auth-api.ts"
import type { CliAuthApiChallengeFailure } from "../../../auth/model/cli-auth-api.ts"
import type { CliSession } from "../../../cli/model.ts"
import { controlCliAuthApiCompleteMfaChallengeContract } from "./contract.ts"
import { http } from "@pressly/cells"
export const controlCliAuthApiCompleteMfaChallengeSurface = http.post<
  CliSession,
  CliAuthApiChallengeFailure
>({
  path: "/control/cli/auth/mfa/challenge",
  bodyLimit: "4kb",
  contextRequirements: ["request-metadata"],
  invalidRequest: {
    input: {
      code: "invalid_body_type",
      message: "Validation body failed.",
      location: "body",
    },
  },
  validateRequest: validateBody(cliAuthApiChallengeBodySchema),
  toSerializedInput: (request) => ({
    ...parsedBody(request, cliAuthApiChallengeBodySchema),
    ...(requestId(request) === undefined
      ? {}
      : { requestId: requestId(request) }),
  }),
  present: (outcome) =>
    presentControlAdminAuth(
      outcome,
      controlCliAuthApiCompleteMfaChallengeContract.output.encode,
    ),
})
