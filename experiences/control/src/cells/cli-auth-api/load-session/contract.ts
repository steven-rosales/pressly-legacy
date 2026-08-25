import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  cliAuthApiSessionFailureSchema,
  cliAuthApiTokenInputSchema,
} from "../../../auth/model/cli-auth-api.ts"
import { cliSessionResultSchema } from "../../../cli/model.ts"

export const controlCliAuthApiLoadSessionContract = defineControlAuthContract({
  label: "control.cli-auth-api-load-session.v1",
  input: cliAuthApiTokenInputSchema.omit({ requestId: true }),
  output: cliSessionResultSchema,
  failure: cliAuthApiSessionFailureSchema,
})
