import { utcIsoStringSchema } from "@pressly/codec/utc-iso"
import { z } from "zod"

export const userProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).nullable(),
    lastName: z.string().trim().min(1).nullable(),
    businessName: z.string().trim().min(1).nullable(),
    phone: z.string().trim().min(1).nullable(),
    email: z.string().email().nullable(),
  })
  .strict()

export const userMutationResultSchema = z
  .object({
    userId: z.string().uuid(),
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict()

export const controlCustomerSchema = userProfileSchema
  .extend({
    id: z.uuid(),
    version: z.number().int().positive(),
    active: z.boolean(),
    displayName: z.string().trim().min(1).max(240),
    possibleDuplicateCount: z.number().int().nonnegative(),
    createdAt: utcIsoStringSchema,
    updatedAt: utcIsoStringSchema,
  })
  .strict()

export const controlCustomerListSchema = z
  .object({
    items: z.array(controlCustomerSchema),
    nextCursor: z.string().trim().min(1).nullable(),
  })
  .strict()

export type UserProfile = z.infer<typeof userProfileSchema>
export type UserMutationResult = z.infer<typeof userMutationResultSchema>
export type ControlCustomer = z.infer<typeof controlCustomerSchema>
export type ControlCustomerList = z.infer<typeof controlCustomerListSchema>
