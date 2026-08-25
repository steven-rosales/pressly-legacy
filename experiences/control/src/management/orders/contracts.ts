import { z } from "zod"
import { utcDateSchema } from "../model/boundary.ts"
import { controlManagementContextSchema } from "../model/context.ts"

export type JsonValue =
  | boolean
  | number
  | string
  | null
  | readonly JsonValue[]
  | JsonObject
export type JsonObject = Readonly<{ [key: string]: JsonValue }>

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return true
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (typeof value !== "object") return false
  const prototype = Object.getPrototypeOf(value) as unknown
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.values(value).every(isJsonValue)
  )
}
const jsonObjectSchema = z.custom<JsonObject>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    isJsonValue(value),
)

export const orderParamsSchema = z.object({ orderId: z.uuid() }).strict()
export const orderListQuerySchema = z
  .object({
    query: z.string().trim().max(120).optional(),
    state: z.enum(["open", "completed", "canceled"]).optional(),
    locationId: z.string().trim().min(1).max(200).optional(),
    cursor: z.string().trim().min(1).max(1_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
const customerReferenceSchema = z
  .object({ resolution: z.literal("resolved"), userId: z.uuid() })
  .strict()
const orderItemSchema = z
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
const fulfillmentInputSchema = z
  .object({
    typeCode: z.string().min(1),
    locationId: z.string().min(1),
    estimatedWeightLbs: z.number().positive().nullable(),
    estimatedWeightSource: z.string().min(1).nullable(),
  })
  .strict()
  .refine(
    (value) =>
      (value.estimatedWeightLbs === null) ===
      (value.estimatedWeightSource === null),
  )
const reasonNoteSchema = z.string().trim().min(1).max(1_000).nullable()
export const createOrderBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    reasonCode: z.enum(["new_customer_order", "recovery_entry"]),
    reasonNote: reasonNoteSchema,
    customer: customerReferenceSchema,
    displayNumber: z.string().min(1).nullable(),
    dueAt: utcDateSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    totalAmountCents: z.number().int().nonnegative(),
    balanceDueCents: z.number().int().nonnegative().nullable(),
    items: z.array(orderItemSchema),
    fulfillment: fulfillmentInputSchema,
  })
  .strict()

const estimatedWeightSchema = z
  .object({
    lbs: z.number().positive().nullable(),
    source: z.string().min(1).nullable(),
  })
  .strict()
  .refine((value) => (value.lbs === null) === (value.source === null))
const orderChangesSchema = z
  .object({
    customer: customerReferenceSchema.optional(),
    displayNumber: z.string().min(1).nullable().optional(),
    dueAt: utcDateSchema.optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    totalAmountCents: z.number().int().nonnegative().optional(),
    balanceDueCents: z.number().int().nonnegative().nullable().optional(),
    items: z.array(orderItemSchema).optional(),
    fulfillment: z
      .object({
        typeCode: z.string().min(1).optional(),
        locationId: z.string().min(1).optional(),
        estimatedWeight: estimatedWeightSchema.optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0)
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0)
export const correctOrderBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    reasonCode: z.enum([
      "customer_correction",
      "manager_correction",
      "source_discrepancy",
    ]),
    reasonNote: reasonNoteSchema,
    expectedOrderVersion: z.number().int().positive(),
    expectedFulfillmentVersion: z.number().int().positive(),
    changes: orderChangesSchema,
  })
  .strict()

const orderCustomerSchema = z
  .object({
    resolution: z.enum(["resolved", "not_provided", "pending", "conflict"]),
    userId: z.uuid().nullable(),
    displayName: z.string().trim().min(1).nullable(),
    phone: z.string().trim().min(1).nullable(),
    email: z.email().nullable(),
  })
  .strict()
const orderFulfillmentSchema = z
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
export const orderProjectionSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    displayNumber: z.string().trim().min(1).nullable(),
    state: z.enum(["open", "completed", "canceled"]),
    dueAt: utcDateSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    totalAmountCents: z.number().int().nonnegative(),
    balanceDueCents: z.number().int().nonnegative().nullable(),
    customer: orderCustomerSchema,
    fulfillment: orderFulfillmentSchema,
    createdAt: utcDateSchema,
    updatedAt: utcDateSchema,
  })
  .strict()
export const orderDetailSchema = orderProjectionSchema
  .extend({ items: z.array(orderItemSchema) })
  .strict()
export const orderListSchema = z
  .object({
    items: z.array(orderProjectionSchema),
    nextCursor: z.string().trim().min(1).nullable(),
  })
  .strict()
export const orderMutationSchema = z
  .object({
    orderId: z.uuid(),
    fulfillmentId: z.uuid(),
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict()

export const listControlOrdersInputSchema = z
  .object({
    context: controlManagementContextSchema,
    query: z.string().trim().max(120).optional(),
    state: z.enum(["open", "completed", "canceled"]).optional(),
    locationId: z.string().trim().min(1).max(200).optional(),
    cursor: z.string().trim().min(1).max(1_000).optional(),
    limit: z.number().int().min(1).max(100),
  })
  .strict()
export const getControlOrderInputSchema = z
  .object({ context: controlManagementContextSchema, orderId: z.uuid() })
  .strict()
export const createControlOrderInputSchema = createOrderBodySchema
  .extend({ context: controlManagementContextSchema })
  .strict()
export const correctControlOrderInputSchema = correctOrderBodySchema
  .extend({ context: controlManagementContextSchema, orderId: z.uuid() })
  .strict()

export type ListControlOrdersInput = z.output<
  typeof listControlOrdersInputSchema
>
export type GetControlOrderInput = z.output<typeof getControlOrderInputSchema>
export type CreateControlOrderInput = z.output<
  typeof createControlOrderInputSchema
>
export type CorrectControlOrderInput = z.output<
  typeof correctControlOrderInputSchema
>
export type OrderProjection = z.output<typeof orderProjectionSchema>
export type OrderDetail = z.output<typeof orderDetailSchema>
export type OrderList = z.output<typeof orderListSchema>
export type OrderMutation = z.output<typeof orderMutationSchema>
