import { utcIsoStringSchema } from "@pressly/codec/utc-iso"
import { z } from "zod"

export const processorOperationalOrderIdentitySchema = z
  .object({
    displayNumber: z.string().min(1),
    customerDisplayName: z.string().min(1).nullable(),
  })
  .strict()

export const processorCustomerResolutionSchema = z.enum([
  "resolved",
  "not_provided",
  "pending",
  "conflict",
])

export const processorOrderAuditEntrySchema = z
  .object({
    kind: z.enum(["source_observation", "order_command", "production_command"]),
    code: z.string().min(1),
    occurredAt: utcIsoStringSchema,
    actor: z.string().min(1),
    outcome: z.string().min(1).nullable(),
  })
  .strict()

export const processorOrderContextSchema = z
  .object({
    canonicalOrderId: z.string().uuid(),
    canonicalFulfillmentId: z.string().uuid(),
    versions: z
      .object({
        order: z.number().int().positive(),
        fulfillment: z.number().int().positive(),
      })
      .strict(),
    displayNumber: z.string().min(1).nullable(),
    customer: z
      .object({
        resolution: processorCustomerResolutionSchema,
        userId: z.string().uuid().nullable(),
        firstName: z.string().nullable(),
        lastName: z.string().nullable(),
        businessName: z.string().nullable(),
        phone: z.string().nullable(),
      })
      .strict(),
    commercialState: z.enum(["open", "completed", "canceled"]),
    admissionState: z.enum(["unreleased", "released", "withdrawn"]),
    source: z
      .object({
        name: z.string().min(1),
      })
      .strict()
      .nullable(),
    audit: z.array(processorOrderAuditEntrySchema).max(8),
  })
  .strict()

export type ProcessorOperationalOrderIdentity = z.infer<
  typeof processorOperationalOrderIdentitySchema
>
export type ProcessorOrderContext = z.infer<typeof processorOrderContextSchema>
export type ProcessorOrderAuditEntry = z.infer<
  typeof processorOrderAuditEntrySchema
>
