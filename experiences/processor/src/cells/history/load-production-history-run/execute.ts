import type { ProcessorProductionHistoryRunDetail } from "../../../contracts/production-history.ts"
import type {
  OperationalOrderReference,
  ResolveOperationalOrderCanonical,
} from "../../../server/model/operational-order.ts"
import {
  productionQueryFailureOutcome,
  type ProductionQuery,
} from "../../../server/model/production-query.ts"
import type { LoadProcessorProductionHistoryRunInput } from "./contract.ts"
import type { ProductionHistoryRunDetail } from "@pressly/production-system/contracts/read-models/production-history"
import {
  productionOrderReferenceId,
  requireOperationalOrder,
  resolveOperationalOrders,
} from "../../../server/model/operational-order.ts"
import { loadProcessorProductionHistoryRunCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

export type LoadProductionHistoryRun = ProductionQuery<
  LoadProcessorProductionHistoryRunInput,
  ProductionHistoryRunDetail
>

const referencesFor = (
  run: ProductionHistoryRunDetail
): readonly OperationalOrderReference[] =>
  run.orderMemberships.map((membership) => ({
    referenceId: productionOrderReferenceId(membership.productionOrderId),
    productionOrderId: membership.productionOrderId,
    orderDemandId: null,
    fallbackDisplayNumber: membership.externalOrderId,
  }))

const project = async (
  run: ProductionHistoryRunDetail,
  resolve: ResolveOperationalOrderCanonical
): Promise<ProcessorProductionHistoryRunDetail> => {
  const resolutions = await resolveOperationalOrders(
    resolve,
    referencesFor(run)
  )
  return {
    ...run,
    orderMemberships: run.orderMemberships.map((membership) => ({
      ...membership,
      identity: requireOperationalOrder(
        resolutions,
        productionOrderReferenceId(membership.productionOrderId)
      ).identity,
    })),
  }
}

export const makeLoadProcessorProductionHistoryRunCell = (dependencies: {
  loadRun: LoadProductionHistoryRun
  resolveOrderCanonical: ResolveOperationalOrderCanonical
}) =>
  defineOperation(
    loadProcessorProductionHistoryRunCellDeclaration,
    async (input) => {
      const run = await dependencies.loadRun(input)
      return run.kind === "failure"
        ? productionQueryFailureOutcome(run.failure)
        : {
            kind: "success",
            value: await project(run.value, dependencies.resolveOrderCanonical),
          }
    }
  )
