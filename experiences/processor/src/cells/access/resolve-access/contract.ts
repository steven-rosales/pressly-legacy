import { z } from "zod"
import {
  type AccessSuccess,
  defineProcessorAuthContract,
  processorAccessSchema,
  processorAuthUtcDateSchema,
} from "../../../server/authentication/model.ts"

const exactOptionalSchema = <Value>(schema: z.ZodType): z.ZodType<Value> =>
  schema as z.ZodType<Value>

const accessRoleSchema = z.enum(["owner", "manager", "operator"])
const accessScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("global"), id: z.literal("*") }).strict(),
  z.object({ kind: z.literal("business"), id: z.string() }).strict(),
  z.object({ kind: z.literal("location"), id: z.string() }).strict(),
  z
    .object({ kind: z.literal("resource"), type: z.string(), id: z.string() })
    .strict(),
])

export const resolveProcessorAccessInputSchema = z
  .object({
    principal: z
      .object({
        identityId: z.string(),
        kind: z.enum(["human", "service"]),
        displayName: z.string(),
        email: z.string().optional(),
        audience: z.literal("customer").optional(),
        customerId: z.string().optional(),
        sessionId: z.string().optional(),
        sessionIssuedAt: processorAuthUtcDateSchema.optional(),
        sessionExpiresAt: processorAuthUtcDateSchema.optional(),
      })
      .strict()
      .superRefine((principal, context) => {
        if (
          (principal.audience === "customer") !==
          (principal.customerId !== undefined)
        )
          context.addIssue({
            code: "custom",
            path: ["audience"],
            message:
              "Customer audience and customer ID must be present together.",
          })
      }),
    principalAttributes: z
      .object({
        assignments: z.array(
          z
            .object({
              role: accessRoleSchema,
              scope: accessScopeSchema,
              state: z.enum(["active", "revoked", "expired"]),
              version: z.number(),
              startsAt: processorAuthUtcDateSchema.optional(),
              endsAt: processorAuthUtcDateSchema.optional(),
            })
            .strict()
        ),
        identityActive: z.boolean(),
        assuranceLevel: z.enum(["password", "mfa", "service_key"]).optional(),
      })
      .strict(),
  })
  .strict()

export type ResolveProcessorAccessInput = AccessSuccess<"loadSession">

export const resolveProcessorAccessContract = defineProcessorAuthContract({
  label: "processor.resolve-access.v1",
  input: exactOptionalSchema<ResolveProcessorAccessInput>(
    resolveProcessorAccessInputSchema
  ),
  output: processorAccessSchema.nullable(),
  failure: z.never(),
})
