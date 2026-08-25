import { utcIsoStringSchema } from "@pressly/codec/utc-iso"
import { jsonObjectSchema } from "@pressly/codec/zod"
import { z } from "zod"

const orderItemInputSchema = z
  .object({
    lineKey: z.string().min(1),
    itemType: z.string().min(1),
    code: z.string().min(1),
    description: z.string().min(1),
    quantity: z.number().nonnegative(),
    unit: z.string().min(1),
    unitPriceCents: z.number().int().nonnegative(),
    totalAmountCents: z.number().int().nonnegative(),
    sourceMetadata: jsonObjectSchema,
  })
  .strict()

export const orderMutationResultSchema = z
  .object({
    orderId: z.string().uuid(),
    fulfillmentId: z.string().uuid(),
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict()

const controlOrderCustomerSchema = z
  .object({
    resolution: z.enum(["resolved", "not_provided", "pending", "conflict"]),
    userId: z.uuid().nullable(),
    displayName: z.string().trim().min(1).nullable(),
    phone: z.string().trim().min(1).nullable(),
    email: z.email().nullable(),
  })
  .strict()

const controlOrderFulfillmentSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    typeCode: z.string().trim().min(1),
    locationId: z.string().trim().min(1),
    releaseState: z.enum(["unreleased", "released", "withdrawn"]),
    estimatedWeightLbs: z.number().positive().nullable(),
    estimatedWeightSource: z.string().trim().min(1).nullable(),
  })
  .strict()

export const controlOrderSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    displayNumber: z.string().trim().min(1).nullable(),
    state: z.enum(["open", "completed", "canceled"]),
    dueAt: utcIsoStringSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    totalAmountCents: z.number().int().nonnegative(),
    balanceDueCents: z.number().int().nonnegative().nullable(),
    customer: controlOrderCustomerSchema,
    fulfillment: controlOrderFulfillmentSchema,
    createdAt: utcIsoStringSchema,
    updatedAt: utcIsoStringSchema,
  })
  .strict()

export const controlOrderDetailSchema = controlOrderSchema
  .extend({ items: z.array(orderItemInputSchema) })
  .strict()

export const controlOrderListSchema = z
  .object({
    items: z.array(controlOrderSchema),
    nextCursor: z.string().trim().min(1).nullable(),
  })
  .strict()

export type OrderMutationResult = z.infer<typeof orderMutationResultSchema>
export type ControlOrder = z.infer<typeof controlOrderSchema>
export type ControlOrderDetail = z.infer<typeof controlOrderDetailSchema>
export type ControlOrderList = z.infer<typeof controlOrderListSchema>
