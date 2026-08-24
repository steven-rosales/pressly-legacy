import {
  productionBatchOrderSchema,
  productionBatchSchema,
  productionBoardSchema,
} from "@pressly/production-system/contracts/read-models/production-board"
import { z } from "zod"

import { processorOperationalOrderIdentitySchema } from "./operational-order.ts"

export const processorProductionBatchOrderSchema = productionBatchOrderSchema
  .safeExtend({ identity: processorOperationalOrderIdentitySchema })
  .strict()

export const processorProductionBatchSchema = productionBatchSchema
  .safeExtend({
    orders: z.array(processorProductionBatchOrderSchema).min(1),
  })
  .strict()

export const processorProductionBoardSchema = productionBoardSchema
  .extend({
    batches: z.array(processorProductionBatchSchema),
  })
  .strict()

export type ProcessorProductionBatchOrder = z.infer<
  typeof processorProductionBatchOrderSchema
>
export type ProcessorProductionBatch = z.infer<
  typeof processorProductionBatchSchema
>
export type ProcessorProductionBoard = z.infer<
  typeof processorProductionBoardSchema
>
