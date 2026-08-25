import { cliSessionSchema, defineAdminCliContract } from "../../../cli/model.ts"
import { z } from "zod"

export const loginSecretInputSchema = z
  .object({
    password: z.string().min(1),
    mfaCode: z.string().min(1).optional(),
    recoveryCode: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (input) => input.mfaCode === undefined || input.recoveryCode === undefined,
    { message: "Supply either mfaCode or recoveryCode, not both." },
  )

export const loginInputSchema = z
  .object({
    email: z.string().optional(),
    password: z.string().optional(),
    mfaCode: z.string().optional(),
    recoveryCode: z.string().optional(),
  })
  .strict()

export const loginContract = defineAdminCliContract({
  label: "control.cli-auth-login.v1",
  input: loginInputSchema,
  output: cliSessionSchema,
})
