import {
  productionLiveRunChangeOrderSchema,
  productionLiveRunChangesSchema,
  productionPendingOrderSchema,
  productionWorkspaceSchema,
} from "@pressly/production-system/contracts/read-models/production-board"
import {
  productionOrderListItemSchema,
  productionOrderSummarySchema,
} from "@pressly/production-system/contracts/read-models/production-order"
import { z } from "zod"

import { processorOperationalOrderIdentitySchema } from "./operational-order.ts"
import { processorProductionBoardSchema } from "./production-board.ts"

export const processorProductionOrderListItemSchema =
  productionOrderListItemSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict()

export const processorProductionOrderSummarySchema =
  productionOrderSummarySchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict()

export const processorProductionPendingOrderSchema =
  productionPendingOrderSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict()

export const processorProductionLiveRunChangeOrderSchema =
  productionLiveRunChangeOrderSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict()

export const processorProductionLiveRunChangesSchema =
  productionLiveRunChangesSchema
    .extend({
      orders: z.array(processorProductionLiveRunChangeOrderSchema),
    })
    .strict()

export const processorProductionWorkspaceSchema = productionWorkspaceSchema
  .extend({
    orders: z.array(processorProductionOrderListItemSchema),
    pendingEligibleOrders: z.array(processorProductionPendingOrderSchema),
    liveRunChanges: processorProductionLiveRunChangesSchema.nullable(),
    board: processorProductionBoardSchema.nullable(),
  })
  .strict()

export type ProcessorProductionOrderListItem = z.infer<
  typeof processorProductionOrderListItemSchema
>
export type ProcessorProductionOrderSummary = z.infer<
  typeof processorProductionOrderSummarySchema
>
export type ProcessorProductionPendingOrder = z.infer<
  typeof processorProductionPendingOrderSchema
>
export type ProcessorProductionLiveRunChangeOrder = z.infer<
  typeof processorProductionLiveRunChangeOrderSchema
>
export type ProcessorProductionLiveRunChanges = z.infer<
  typeof processorProductionLiveRunChangesSchema
>
export type ProcessorProductionWorkspace = z.infer<
  typeof processorProductionWorkspaceSchema
>
