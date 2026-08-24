import type { ProcessorProductionBoard } from "../../contracts/production-board.ts"
import type { ProductionBoard as CanonicalProductionBoard } from "@pressly/production-system/contracts/read-models/production-board"
import {
  productionOrderReferenceId,
  requireOperationalOrder,
  type OperationalOrderReference,
  type OperationalOrderResolution,
} from "./operational-order.ts"

export const productionBoardOrderReferences = (
  board: CanonicalProductionBoard
): readonly OperationalOrderReference[] =>
  board.batches.flatMap((batch) =>
    batch.orders.map((order) => ({
      referenceId: productionOrderReferenceId(order.id),
      productionOrderId: order.id,
      orderDemandId: null,
      fallbackDisplayNumber: order.externalOrderId,
    }))
  )

export const projectProcessorProductionBoard = (
  board: CanonicalProductionBoard,
  resolutions: ReadonlyMap<string, OperationalOrderResolution>
): ProcessorProductionBoard => ({
  ...board,
  batches: board.batches.map((batch) => ({
    ...batch,
    orders: batch.orders.map((order) => ({
      ...order,
      identity: requireOperationalOrder(
        resolutions,
        productionOrderReferenceId(order.id)
      ).identity,
    })),
  })),
})
