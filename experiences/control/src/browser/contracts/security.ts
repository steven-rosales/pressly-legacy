import { utcIsoStringSchema } from "@pressly/codec/utc-iso"
import { z } from "zod"

export const controlSecurityEventSchema = z
  .object({
    id: z.uuid(),
    eventType: z.string().trim().min(1).max(160),
    resourceType: z.string().trim().min(1).max(160),
    actorDisplayName: z.string().trim().min(1).max(200).nullable(),
    createdAt: utcIsoStringSchema,
  })
  .strict()

export const controlSecurityEventListSchema = z
  .object({
    events: z.array(controlSecurityEventSchema).max(100),
    nextCursor: z.string().max(1_000).nullable(),
  })
  .strict()

export type ControlSecurityEvent = z.infer<typeof controlSecurityEventSchema>
export type ControlSecurityEventList = z.infer<
  typeof controlSecurityEventListSchema
>
