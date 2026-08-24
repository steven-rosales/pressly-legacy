import type { ProcessorListProductionHistoryActivityResult } from "../../../contracts/production-history.ts"
import type { ProductionQueryFailure } from "../../../server/model/production-query.ts"
import type { ListProcessorProductionHistoryActivityInput } from "./contract.ts"
import {
  listProcessorProductionHistoryActivityContract,
  listProcessorProductionHistoryActivityOperationId,
} from "./contract.ts"
import { surface } from "./http.ts"
import { declareQueryCell } from "@pressly/cells"

export const listProcessorProductionHistoryActivityCellDeclaration =
  declareQueryCell<
    ListProcessorProductionHistoryActivityInput,
    ProcessorListProductionHistoryActivityResult,
    ProductionQueryFailure
  >({
    id: listProcessorProductionHistoryActivityOperationId,
    authentication: "required",
    contract: listProcessorProductionHistoryActivityContract,
    authorization: {
      capability: "production:read",
      timing: "after-input",
      scope: (input) => input.locationId,
    },
    surfaces: [surface],
    observability: {
      operation: "processor.list_production_history_activity",
    },
  })
