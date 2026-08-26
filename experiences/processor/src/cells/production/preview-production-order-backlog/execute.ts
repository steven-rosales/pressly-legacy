import type { ProcessorProductionOrderBacklogPreview } from "../../../contracts/production-order-backlog.ts"
import type {
  OperationalOrderReference,
  ResolveOperationalOrderCanonical,
} from "../../../server/model/operational-order.ts"
import {
  productionQueryFailureOutcome,
  type ProductionQuery,
} from "../../../server/model/production-query.ts"
import type {
  PreviewProductionOrderBacklogCommand,
  ProductionOrderBacklogPreview,
} from "@pressly/production-system/contracts/read-models/production-order-backlog"
import {
  productionOrderReferenceId,
  requireOperationalOrder,
  resolveOperationalOrders,
} from "../../../server/model/operational-order.ts"
import { previewProcessorProductionOrderBacklogCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

export type PreviewProductionOrderBacklog = ProductionQuery<
  PreviewProductionOrderBacklogCommand,
  ProductionOrderBacklogPreview
>

const referencesFor = (
  preview: ProductionOrderBacklogPreview
): readonly OperationalOrderReference[] =>
  [
    ...preview.groups.readyToArchive,
    ...preview.groups.reviewIndividually,
    ...preview.groups.keptForSafety,
    ...preview.groups.alreadyHistorical,
  ].map((item) => ({
    referenceId: productionOrderReferenceId(item.orderId),
    productionOrderId: item.orderId,
    orderDemandId: null,
    fallbackDisplayNumber: item.displayReference,
  }))

const project = async (
  preview: ProductionOrderBacklogPreview,
  resolve: ResolveOperationalOrderCanonical
): Promise<ProcessorProductionOrderBacklogPreview> => {
  const resolutions = await resolveOperationalOrders(
    resolve,
    referencesFor(preview)
  )
  const identify = (
    item: ProductionOrderBacklogPreview["groups"]["readyToArchive"][number]
  ) => ({
    ...item,
    identity: requireOperationalOrder(
      resolutions,
      productionOrderReferenceId(item.orderId)
    ).identity,
  })
  return {
    ...preview,
    groups: {
      readyToArchive: preview.groups.readyToArchive.map(identify),
      reviewIndividually: preview.groups.reviewIndividually.map(identify),
      keptForSafety: preview.groups.keptForSafety.map(identify),
      alreadyHistorical: preview.groups.alreadyHistorical.map(identify),
    },
  }
}

export const makePreviewProcessorProductionOrderBacklogCell = (dependencies: {
  previewBacklog: PreviewProductionOrderBacklog
  resolveOrderCanonical: ResolveOperationalOrderCanonical
}) =>
  defineOperation(
    previewProcessorProductionOrderBacklogCellDeclaration,
    async (input) => {
      const preview = await dependencies.previewBacklog(input)
      return preview.kind === "failure"
        ? productionQueryFailureOutcome(preview.failure)
        : {
            kind: "success",
            value: await project(
              preview.value,
              dependencies.resolveOrderCanonical
            ),
          }
    }
  )
