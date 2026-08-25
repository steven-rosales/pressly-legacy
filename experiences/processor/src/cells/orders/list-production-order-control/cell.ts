import type { ListProcessorOrderControlResult } from "../../../contracts/production-order-control.ts"
import type { ProductionQueryFailure } from "../../../server/model/production-query.ts"
import type { ListProcessorProductionOrderControlInput } from "./contract.ts"
import {
  listProcessorProductionOrderControlContract,
  listProcessorProductionOrderControlOperationId,
} from "./contract.ts"
import { surface } from "./http.ts"
import { declareQueryCell } from "@pressly/cells"

export const listProcessorProductionOrderControlCellDeclaration =
  declareQueryCell<
    ListProcessorProductionOrderControlInput,
    ListProcessorOrderControlResult,
    ProductionQueryFailure
  >({
    id: listProcessorProductionOrderControlOperationId,
    authentication: "required",
    contract: listProcessorProductionOrderControlContract,
    authorization: {
      capability: "production:read",
      timing: "after-input",
      scope: (input) => input.locationId,
    },
    surfaces: [surface],
    observability: { operation: "processor.list_production_order_control" },
  })
