import {
  cliMfaEnrollmentSchema,
  defineAdminCliContract,
} from "../../../cli/model.ts"
import { z } from "zod"

export const noInputSchema = z.object({}).strict()

export const enrollmentContract = defineAdminCliContract({
  label: "control.cli-auth-mfa-enroll.v1",
  input: noInputSchema,
  output: cliMfaEnrollmentSchema,
})
