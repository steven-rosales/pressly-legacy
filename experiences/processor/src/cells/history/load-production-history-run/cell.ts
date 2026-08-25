import type { ProcessorProductionHistoryRunDetail } from "../../../contracts/production-history.ts"
import type { ProductionQueryFailure } from "../../../server/model/production-query.ts"
import type { LoadProcessorProductionHistoryRunInput } from "./contract.ts"
import {
  loadProcessorProductionHistoryRunContract,
  loadProcessorProductionHistoryRunOperationId,
} from "./contract.ts"
import { surface } from "./http.ts"
import { declareQueryCell } from "@pressly/cells"

export const loadProcessorProductionHistoryRunCellDeclaration =
  declareQueryCell<
    LoadProcessorProductionHistoryRunInput,
    ProcessorProductionHistoryRunDetail,
    ProductionQueryFailure
  >({
    id: loadProcessorProductionHistoryRunOperationId,
    authentication: "required",
    contract: loadProcessorProductionHistoryRunContract,
    authorization: {
      capability: "production:read",
      timing: "after-input",
      scope: (input) => input.locationId,
    },
    surfaces: [surface],
    observability: { operation: "processor.load_production_history_run" },
  })
