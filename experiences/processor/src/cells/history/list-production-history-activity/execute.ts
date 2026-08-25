import type { ProcessorListProductionHistoryActivityResult } from "../../../contracts/production-history.ts"
import type {
  OperationalOrderReference,
  ResolveOperationalOrderCanonical,
} from "../../../server/model/operational-order.ts"
import {
  productionQueryFailureOutcome,
  type ProductionQuery,
} from "../../../server/model/production-query.ts"
import type { ListProcessorProductionHistoryActivityInput } from "./contract.ts"
import type { ListProductionHistoryActivityResult } from "@pressly/production-system/contracts/read-models/production-history"
import {
  productionOrderReferenceId,
  requireOperationalOrder,
  resolveOperationalOrders,
} from "../../../server/model/operational-order.ts"
import { listProcessorProductionHistoryActivityCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

export type ListProductionHistoryActivity = ProductionQuery<
  ListProcessorProductionHistoryActivityInput,
  ListProductionHistoryActivityResult
>

const referencesFor = (
  activity: ListProductionHistoryActivityResult
): readonly OperationalOrderReference[] =>
  activity.items.flatMap((item) =>
    item.entityType !== "production_order"
      ? []
      : [
          {
            referenceId: productionOrderReferenceId(item.entityId),
            productionOrderId: item.entityId,
            orderDemandId: null,
            fallbackDisplayNumber: item.entityId,
          },
        ]
  )

const project = async (
  activity: ListProductionHistoryActivityResult,
  resolve: ResolveOperationalOrderCanonical
): Promise<ProcessorListProductionHistoryActivityResult> => {
  const resolutions = await resolveOperationalOrders(
    resolve,
    referencesFor(activity)
  )
  return {
    ...activity,
    items: activity.items.map((item) => ({
      ...item,
      identity:
        item.entityType === "production_order"
          ? requireOperationalOrder(
              resolutions,
              productionOrderReferenceId(item.entityId)
            ).identity
          : null,
    })),
  }
}

export const makeListProcessorProductionHistoryActivityCell = (dependencies: {
  listActivity: ListProductionHistoryActivity
  resolveOrderCanonical: ResolveOperationalOrderCanonical
}) =>
  bindCell(
    listProcessorProductionHistoryActivityCellDeclaration,
    async (input) => {
      const activity = await dependencies.listActivity(input)
      return activity.kind === "failure"
        ? productionQueryFailureOutcome(activity.failure)
        : {
            kind: "success",
            value: await project(
              activity.value,
              dependencies.resolveOrderCanonical
            ),
          }
    }
  )
