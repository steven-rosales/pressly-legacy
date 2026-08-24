import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  cliAuthApiChallengeFailureSchema,
  cliAuthApiChallengeInputSchema,
} from "../../../auth/model/cli-auth-api.ts"
import { cliSessionSchema } from "../../../cli/model.ts"

export const controlCliAuthApiCompleteMfaChallengeContract =
  defineControlAuthContract({
    label: "control.cli-auth-api-complete-mfa-challenge.v1",
    input: cliAuthApiChallengeInputSchema,
    output: cliSessionSchema,
    failure: cliAuthApiChallengeFailureSchema,
  })
