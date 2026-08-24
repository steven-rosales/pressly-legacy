import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlManagementContextSchema } from "../../../management/model/context.ts"
import { controlWorkforceFailureSchema } from "../../../management/model/failure.ts"
import { z } from "zod"

export const canonicalIsoStringSchema = z.string().refine((value) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}, "Expected a canonical UTC ISO datetime.")

export const securityEventListSchema = z
  .object({
    events: z
      .array(
        z
          .object({
            id: z.uuid(),
            eventType: z.string().trim().min(1).max(160),
            resourceType: z.string().trim().min(1).max(160),
            actorDisplayName: z.string().trim().min(1).max(200).nullable(),
            createdAt: canonicalIsoStringSchema,
          })
          .strict(),
      )
      .max(100),
    nextCursor: z.string().max(1000).nullable(),
  })
  .strict()

export const inputSchema = z
  .object({
    context: controlManagementContextSchema,
    cursor: z.string().trim().min(1).max(1000).optional(),
    limit: z.number().int().min(1).max(100),
  })
  .strict()

export const listControlSecurityEventsContract =
  defineControlManagementContract({
    label: "control.list-security-events.v1",
    input: inputSchema,
    output: securityEventListSchema,
    failure: controlWorkforceFailureSchema,
  })
