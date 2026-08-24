import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import { cliLogoutSchema } from "../../../cli/model.ts"
import { cliAuthApiTokenInputSchema } from "../../../auth/model/cli-auth-api.ts"
import { noFailureSchema } from "../../../auth/model/schemas.ts"

export const controlCliAuthApiLogoutContract = defineControlAuthContract({
  label: "control.cli-auth-api-logout.v1",
  input: cliAuthApiTokenInputSchema,
  output: cliLogoutSchema,
  failure: noFailureSchema,
})
