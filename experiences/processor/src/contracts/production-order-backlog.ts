import {
  productionOrderBacklogPreviewItemSchema,
  productionOrderBacklogPreviewSchema,
} from "@pressly/production-system/contracts/read-models/production-order-backlog"
import { z } from "zod"

import { processorOperationalOrderIdentitySchema } from "./operational-order.ts"

export const processorProductionOrderBacklogPreviewItemSchema =
  productionOrderBacklogPreviewItemSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict()

export const processorProductionOrderBacklogPreviewSchema =
  productionOrderBacklogPreviewSchema
    .safeExtend({
      groups: z
        .object({
          readyToArchive: z.array(
            processorProductionOrderBacklogPreviewItemSchema
          ),
          reviewIndividually: z.array(
            processorProductionOrderBacklogPreviewItemSchema
          ),
          keptForSafety: z.array(
            processorProductionOrderBacklogPreviewItemSchema
          ),
          alreadyHistorical: z.array(
            processorProductionOrderBacklogPreviewItemSchema
          ),
        })
        .strict(),
    })
    .strict()

export type ProcessorProductionOrderBacklogPreviewItem = z.infer<
  typeof processorProductionOrderBacklogPreviewItemSchema
>
export type ProcessorProductionOrderBacklogPreview = z.infer<
  typeof processorProductionOrderBacklogPreviewSchema
>
