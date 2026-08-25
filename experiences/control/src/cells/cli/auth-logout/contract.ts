import { cliLogoutSchema, defineAdminCliContract } from "../../../cli/model.ts"
import { z } from "zod"

export const noInputSchema = z.object({}).strict()

export const logoutContract = defineAdminCliContract({
  label: "control.cli-auth-logout.v1",
  input: noInputSchema,
  output: cliLogoutSchema,
})
