import {
  cliRecoveryCodesSchema,
  defineAdminCliContract,
} from "../../../cli/model.ts"
import { z } from "zod"

export const confirmInputSchema = z
  .object({ code: z.string().optional() })
  .strict()

export const confirmContract = defineAdminCliContract({
  label: "control.cli-auth-mfa-confirm.v1",
  input: confirmInputSchema,
  output: cliRecoveryCodesSchema,
})
