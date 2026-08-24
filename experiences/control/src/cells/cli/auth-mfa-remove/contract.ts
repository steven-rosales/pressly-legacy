import {
  cliMfaMutationSchema,
  defineAdminCliContract,
} from "../../../cli/model.ts"
import { z } from "zod"

export const noInputSchema = z.object({}).strict()

export const removeContract = defineAdminCliContract({
  label: "control.cli-auth-mfa-remove.v1",
  input: noInputSchema,
  output: cliMfaMutationSchema,
})
