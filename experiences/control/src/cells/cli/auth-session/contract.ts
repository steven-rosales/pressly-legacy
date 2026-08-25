import {
  cliSessionResultSchema,
  defineAdminCliContract,
} from "../../../cli/model.ts"
import { z } from "zod"

export const noInputSchema = z.object({}).strict()

export const sessionContract = defineAdminCliContract({
  label: "control.cli-auth-session.v1",
  input: noInputSchema,
  output: cliSessionResultSchema,
})
