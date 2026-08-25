import type { ResolveOperationalOrderCanonical } from "../../../server/model/operational-order.ts"
import {
  productionQueryFailureOutcome,
  type ProductionQuery,
} from "../../../server/model/production-query.ts"
import type { LoadProcessorProductionBoardInput } from "./contract.ts"
import type { ProductionBoard } from "@pressly/production-system/contracts/read-models/production-board"
import { resolveOperationalOrders } from "../../../server/model/operational-order.ts"
import {
  productionBoardOrderReferences,
  projectProcessorProductionBoard,
} from "../../../server/model/production-board.ts"
import { loadProcessorProductionBoardCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

export type LoadProductionBoard = ProductionQuery<
  LoadProcessorProductionBoardInput,
  ProductionBoard
>

export const makeLoadProcessorProductionBoardCell = (dependencies: {
  loadBoard: LoadProductionBoard
  resolveOrderCanonical: ResolveOperationalOrderCanonical
}) =>
  bindCell(loadProcessorProductionBoardCellDeclaration, async (input) => {
    const loaded = await dependencies.loadBoard(input)
    if (loaded.kind === "failure")
      return productionQueryFailureOutcome(loaded.failure)
    const resolutions = await resolveOperationalOrders(
      dependencies.resolveOrderCanonical,
      productionBoardOrderReferences(loaded.value)
    )
    return {
      kind: "success",
      value: projectProcessorProductionBoard(loaded.value, resolutions),
    }
  })
