import { z } from "zod"
import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  controlAccessSchema,
  noFailureSchema,
} from "../../../auth/model/schemas.ts"

export const resolveControlAccessInputSchema = z
  .object({
    identityId: z.string(),
    assuranceLevel: z.enum(["password", "mfa", "service_key"]).optional(),
  })
  .strict()

export type ResolveControlAccessInput = z.output<
  typeof resolveControlAccessInputSchema
>

export const resolveControlAccessOutputSchema = controlAccessSchema.nullable()

export const resolveControlAccessContract = defineControlAuthContract({
  label: "control.resolve-access.v1",
  input: resolveControlAccessInputSchema,
  output: resolveControlAccessOutputSchema,
  failure: noFailureSchema,
})
