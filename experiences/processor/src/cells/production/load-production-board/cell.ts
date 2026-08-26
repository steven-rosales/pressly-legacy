import type { ProcessorProductionBoard } from "../../../contracts/production-board.ts"
import type { ProductionQueryFailure } from "../../../server/model/production-query.ts"
import type { LoadProcessorProductionBoardInput } from "./contract.ts"
import {
  loadProcessorProductionBoardContract,
  loadProcessorProductionBoardOperationId,
} from "./contract.ts"
import { surface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const loadProcessorProductionBoardCellDeclaration = defineOperation<
  LoadProcessorProductionBoardInput,
  ProcessorProductionBoard,
  ProductionQueryFailure
>({
  kind: "query",
  id: loadProcessorProductionBoardOperationId,
  authentication: "required",
  contract: loadProcessorProductionBoardContract,
  authorization: {
    capability: "production:read",
    timing: "after-input",
    scope: (input) => input.locationId,
  },
  surfaces: [surface],
  observability: { operation: "processor.load_production_board" },
})
