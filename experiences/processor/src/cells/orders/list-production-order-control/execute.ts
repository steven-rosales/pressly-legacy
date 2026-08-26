import type { ListProcessorOrderControlResult } from "../../../contracts/production-order-control.ts"
import type { LoadOperationalOrderAudit } from "../../../server/model/operational-order-audit.ts"
import type {
  OperationalOrderReference,
  ResolveOperationalOrderCanonical,
} from "../../../server/model/operational-order.ts"
import {
  productionQueryFailureOutcome,
  type ProductionQuery,
} from "../../../server/model/production-query.ts"
import type { ListProcessorProductionOrderControlInput } from "./contract.ts"
import type { ListProductionOrderControlResult } from "@pressly/production-system/contracts/read-models/production-order-control"
import {
  loadOperationalOrderContexts,
  requireOperationalOrderContext,
} from "../../../server/model/operational-order-audit.ts"
import { listProcessorProductionOrderControlCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

export type ListProductionOrderControl = ProductionQuery<
  ListProcessorProductionOrderControlInput,
  ListProductionOrderControlResult
>

const referencesFor = (
  result: ListProductionOrderControlResult
): readonly OperationalOrderReference[] =>
  result.items.map((item) => ({
    referenceId: item.order.id,
    productionOrderId: item.order.id,
    orderDemandId: null,
    fallbackDisplayNumber: item.order.externalOrderId,
  }))

const project = async (
  result: ListProductionOrderControlResult,
  resolve: ResolveOperationalOrderCanonical,
  loadAudit: LoadOperationalOrderAudit
): Promise<ListProcessorOrderControlResult> => {
  const contexts = await loadOperationalOrderContexts({
    references: referencesFor(result),
    resolve,
    loadAudit,
  })
  return {
    ...result,
    items: result.items.map((item) => {
      const context = requireOperationalOrderContext(contexts, item.order.id)
      return {
        ...item,
        identity: context.identity,
        canonical: context.canonical,
      }
    }),
  }
}

export const makeListProcessorProductionOrderControlCell = (dependencies: {
  listOrderControl: ListProductionOrderControl
  resolveOrderCanonical: ResolveOperationalOrderCanonical
  loadOrderAudit: LoadOperationalOrderAudit
}) =>
  defineOperation(
    listProcessorProductionOrderControlCellDeclaration,
    async (input) => {
      const result = await dependencies.listOrderControl(input)
      return result.kind === "failure"
        ? productionQueryFailureOutcome(result.failure)
        : {
            kind: "success",
            value: await project(
              result.value,
              dependencies.resolveOrderCanonical,
              dependencies.loadOrderAudit
            ),
          }
    }
  )
