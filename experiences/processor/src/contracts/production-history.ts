import {
  listProductionHistoryActivityResultSchema,
  productionHistoryActivityEntrySchema,
  productionHistoryOrderMembershipSchema,
  productionHistoryRunDetailSchema,
} from "@pressly/production-system/contracts/read-models/production-history"
import { z } from "zod"

import { processorOperationalOrderIdentitySchema } from "./operational-order.ts"

export const processorProductionHistoryOrderMembershipSchema =
  productionHistoryOrderMembershipSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict()

export const processorProductionHistoryRunDetailSchema =
  productionHistoryRunDetailSchema
    .extend({
      orderMemberships: z.array(
        processorProductionHistoryOrderMembershipSchema
      ),
    })
    .strict()

export const processorProductionHistoryActivityEntrySchema =
  productionHistoryActivityEntrySchema
    .safeExtend({
      identity: processorOperationalOrderIdentitySchema.nullable(),
    })
    .superRefine((entry, context) => {
      const requiresIdentity = entry.entityType === "production_order"
      if (requiresIdentity !== (entry.identity !== null))
        context.addIssue({
          code: "custom",
          path: ["identity"],
          message:
            "Only Production order activity entries must carry operational order identity.",
        })
    })

export const processorListProductionHistoryActivityResultSchema =
  listProductionHistoryActivityResultSchema
    .extend({
      items: z.array(processorProductionHistoryActivityEntrySchema),
    })
    .strict()

export type ProcessorProductionHistoryOrderMembership = z.infer<
  typeof processorProductionHistoryOrderMembershipSchema
>
export type ProcessorProductionHistoryRunDetail = z.infer<
  typeof processorProductionHistoryRunDetailSchema
>
export type ProcessorProductionHistoryActivityEntry = z.infer<
  typeof processorProductionHistoryActivityEntrySchema
>
export type ProcessorListProductionHistoryActivityResult = z.infer<
  typeof processorListProductionHistoryActivityResultSchema
>
