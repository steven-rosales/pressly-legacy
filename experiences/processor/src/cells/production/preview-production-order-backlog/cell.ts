import type { ProcessorProductionOrderBacklogPreview } from "../../../contracts/production-order-backlog.ts"
import type { ProductionQueryFailure } from "../../../server/model/production-query.ts"
import type { PreviewProductionOrderBacklogCommand } from "@pressly/production-system/contracts/read-models/production-order-backlog"
import {
  previewProcessorProductionOrderBacklogContract,
  previewProcessorProductionOrderBacklogOperationId,
} from "./contract.ts"
import { surface } from "./http.ts"
import { declareQueryCell } from "@pressly/cells"

export const previewProcessorProductionOrderBacklogCellDeclaration =
  declareQueryCell<
    PreviewProductionOrderBacklogCommand,
    ProcessorProductionOrderBacklogPreview,
    ProductionQueryFailure
  >({
    id: previewProcessorProductionOrderBacklogOperationId,
    authentication: "required",
    contract: previewProcessorProductionOrderBacklogContract,
    authorization: {
      capability: "production:override",
      timing: "after-input",
      scope: (input) => input.locationId,
    },
    surfaces: [surface],
    observability: {
      operation: "processor.preview_production_order_backlog",
    },
  })
