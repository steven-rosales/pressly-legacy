import type { ProcessorProductionWorkspace } from "../../../contracts/production-workspace.ts"
import type {
  OperationalOrderReference,
  ResolveOperationalOrderCanonical,
} from "../../../server/model/operational-order.ts"
import {
  productionQueryFailureOutcome,
  type ProductionQuery,
} from "../../../server/model/production-query.ts"
import type { LoadProcessorProductionWorkspaceInput } from "./contract.ts"
import type { ProductionWorkspace } from "@pressly/production-system/contracts/read-models/production-board"
import {
  productionOrderReferenceId,
  requireOperationalOrder,
  resolveOperationalOrders,
} from "../../../server/model/operational-order.ts"
import {
  productionBoardOrderReferences,
  projectProcessorProductionBoard,
} from "../../../server/model/production-board.ts"
import { loadProcessorProductionWorkspaceCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

export type LoadProductionWorkspace = ProductionQuery<
  LoadProcessorProductionWorkspaceInput,
  ProductionWorkspace
>

const orderReference = (order: {
  id: string
  externalOrderId: string
}): OperationalOrderReference => ({
  referenceId: productionOrderReferenceId(order.id),
  productionOrderId: order.id,
  orderDemandId: null,
  fallbackDisplayNumber: order.externalOrderId,
})

const referencesFor = (
  workspace: ProductionWorkspace
): readonly OperationalOrderReference[] => [
  ...workspace.orders.map(orderReference),
  ...workspace.pendingEligibleOrders.map(orderReference),
  ...(workspace.liveRunChanges?.orders.map(orderReference) ?? []),
  ...(workspace.board === null
    ? []
    : productionBoardOrderReferences(workspace.board)),
]

const project = async (
  workspace: ProductionWorkspace,
  resolve: ResolveOperationalOrderCanonical
): Promise<ProcessorProductionWorkspace> => {
  const resolutions = await resolveOperationalOrders(
    resolve,
    referencesFor(workspace)
  )
  const identify = <
    Order extends {
      id: string
    },
  >(
    order: Order
  ) => ({
    ...order,
    identity: requireOperationalOrder(
      resolutions,
      productionOrderReferenceId(order.id)
    ).identity,
  })
  return {
    ...workspace,
    orders: workspace.orders.map(identify),
    pendingEligibleOrders: workspace.pendingEligibleOrders.map(identify),
    liveRunChanges:
      workspace.liveRunChanges === null
        ? null
        : {
            ...workspace.liveRunChanges,
            orders: workspace.liveRunChanges.orders.map(identify),
          },
    board:
      workspace.board === null
        ? null
        : projectProcessorProductionBoard(workspace.board, resolutions),
  }
}

export const makeLoadProcessorProductionWorkspaceCell = (dependencies: {
  loadWorkspace: LoadProductionWorkspace
  resolveOrderCanonical: ResolveOperationalOrderCanonical
}) =>
  bindCell(loadProcessorProductionWorkspaceCellDeclaration, async (input) => {
    const workspace = await dependencies.loadWorkspace(input)
    return workspace.kind === "failure"
      ? productionQueryFailureOutcome(workspace.failure)
      : {
          kind: "success",
          value: await project(
            workspace.value,
            dependencies.resolveOrderCanonical
          ),
        }
  })
