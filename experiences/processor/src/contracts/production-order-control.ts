import {
  listProductionOrderControlResultSchema,
  productionOrderControlItemSchema,
} from "@pressly/production-system/contracts/read-models/production-order-control"
import { z } from "zod"

import {
  processorOperationalOrderIdentitySchema,
  processorOrderContextSchema,
} from "./operational-order.ts"

export const processorOrderControlItemSchema = productionOrderControlItemSchema
  .extend({
    identity: processorOperationalOrderIdentitySchema,
    canonical: processorOrderContextSchema.nullable(),
  })
  .strict()

export const listProcessorOrderControlResultSchema =
  listProductionOrderControlResultSchema
    .extend({ items: z.array(processorOrderControlItemSchema) })
    .strict()

export type ProcessorOrderControlItem = z.infer<
  typeof processorOrderControlItemSchema
>
export type ListProcessorOrderControlResult = z.infer<
  typeof listProcessorOrderControlResultSchema
>
