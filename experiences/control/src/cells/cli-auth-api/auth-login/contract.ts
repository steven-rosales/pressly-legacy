import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  cliAuthApiLoginFailureSchema,
  cliAuthApiLoginInputSchema,
} from "../../../auth/model/cli-auth-api.ts"
import { cliLoginResultSchema } from "../../../cli/model.ts"

export const controlCliAuthApiLoginContract = defineControlAuthContract({
  label: "control.cli-auth-api-login.v1",
  input: cliAuthApiLoginInputSchema,
  output: cliLoginResultSchema,
  failure: cliAuthApiLoginFailureSchema,
})
