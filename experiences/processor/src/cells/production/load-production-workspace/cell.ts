import type { ProcessorProductionWorkspace } from "../../../contracts/production-workspace.ts"
import type { ProductionQueryFailure } from "../../../server/model/production-query.ts"
import type { LoadProcessorProductionWorkspaceInput } from "./contract.ts"
import {
  loadProcessorProductionWorkspaceContract,
  loadProcessorProductionWorkspaceOperationId,
} from "./contract.ts"
import { surface } from "./http.ts"
import { declareQueryCell } from "@pressly/cells"

export const loadProcessorProductionWorkspaceCellDeclaration = declareQueryCell<
  LoadProcessorProductionWorkspaceInput,
  ProcessorProductionWorkspace,
  ProductionQueryFailure
>({
  id: loadProcessorProductionWorkspaceOperationId,
  authentication: "required",
  contract: loadProcessorProductionWorkspaceContract,
  authorization: {
    capability: "production:read",
    timing: "after-input",
    scope: (input) => input.locationId,
  },
  surfaces: [surface],
  observability: { operation: "processor.load_production_workspace" },
})
