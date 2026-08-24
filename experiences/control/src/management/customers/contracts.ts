import { z } from "zod"
import { utcDateSchema } from "../model/boundary.ts"
import { controlManagementContextSchema } from "../model/context.ts"

export const customerProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).nullable(),
    lastName: z.string().trim().min(1).nullable(),
    businessName: z.string().trim().min(1).nullable(),
    phone: z.string().trim().min(1).nullable(),
    email: z.email().nullable(),
  })
  .strict()

export const customerParamsSchema = z.object({ userId: z.uuid() }).strict()
export const customerListQuerySchema = z
  .object({
    query: z.string().trim().max(120).optional(),
    active: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    cursor: z.string().trim().min(1).max(1_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
export const createCustomerBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    profile: customerProfileSchema,
  })
  .strict()
export const updateCustomerBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    expectedVersion: z.number().int().positive(),
    changes: customerProfileSchema
      .partial()
      .extend({ active: z.boolean().optional() }),
  })
  .strict()

export const customerProjectionSchema = customerProfileSchema
  .extend({
    id: z.uuid(),
    version: z.number().int().positive(),
    active: z.boolean(),
    displayName: z.string().trim().min(1).max(240),
    possibleDuplicateCount: z.number().int().nonnegative(),
    createdAt: utcDateSchema,
    updatedAt: utcDateSchema,
  })
  .strict()
export const customerListSchema = z
  .object({
    items: z.array(customerProjectionSchema),
    nextCursor: z.string().trim().min(1).nullable(),
  })
  .strict()
export const customerMutationSchema = z
  .object({
    userId: z.uuid(),
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict()

export const listControlCustomersInputSchema = z
  .object({
    context: controlManagementContextSchema,
    query: z.string().trim().max(120).optional(),
    active: z.boolean().optional(),
    cursor: z.string().trim().min(1).max(1_000).optional(),
    limit: z.number().int().min(1).max(100),
  })
  .strict()
export const getControlCustomerInputSchema = z
  .object({ context: controlManagementContextSchema, userId: z.uuid() })
  .strict()
export const createControlCustomerInputSchema = createCustomerBodySchema
  .extend({ context: controlManagementContextSchema })
  .strict()
export const updateControlCustomerInputSchema = updateCustomerBodySchema
  .extend({ context: controlManagementContextSchema, userId: z.uuid() })
  .strict()

export type ListControlCustomersInput = z.output<
  typeof listControlCustomersInputSchema
>
export type GetControlCustomerInput = z.output<
  typeof getControlCustomerInputSchema
>
export type CreateControlCustomerInput = z.output<
  typeof createControlCustomerInputSchema
>
export type UpdateControlCustomerInput = z.output<
  typeof updateControlCustomerInputSchema
>
export type CustomerProjection = z.output<typeof customerProjectionSchema>
export type CustomerList = z.output<typeof customerListSchema>
export type CustomerMutation = z.output<typeof customerMutationSchema>
