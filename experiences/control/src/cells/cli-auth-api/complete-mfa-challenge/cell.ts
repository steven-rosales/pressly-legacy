import type {
  CliAuthApiChallengeFailure,
  CliAuthApiChallengeInput,
} from "../../../auth/model/cli-auth-api.ts"
import type { CliSession } from "../../../cli/model.ts"
import { controlCliAuthApiCompleteMfaChallengeContract } from "./contract.ts"
import { controlCliAuthApiCompleteMfaChallengeSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const controlCliAuthApiCompleteMfaChallengeCellDeclaration =
  declareCommandCell<
    CliAuthApiChallengeInput,
    CliSession,
    CliAuthApiChallengeFailure
  >({
    id: "control.cli-auth-api-complete-mfa-challenge.v1",
    authentication: "none",
    contract: controlCliAuthApiCompleteMfaChallengeContract,
    consistency: { transaction: "none", concurrency: "none" },
    idempotency: { required: false },
    surfaces: [controlCliAuthApiCompleteMfaChallengeSurface],
    observability: {
      operation: "control.cli_auth_api.complete_mfa_challenge",
    },
  })
