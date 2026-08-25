import {
  cliRecoveryCodesSchema,
  defineAdminCliContract,
} from "../../../cli/model.ts"
import { z } from "zod"

export const noInputSchema = z.object({}).strict()

export const recoveryContract = defineAdminCliContract({
  label: "control.cli-auth-mfa-recovery-codes.v1",
  input: noInputSchema,
  output: cliRecoveryCodesSchema,
})
