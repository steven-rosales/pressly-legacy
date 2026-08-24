import { declareQueryCell } from "@pressly/cells"
import {
  resolveProcessorAccessContract,
  type ResolveProcessorAccessInput,
} from "./contract.ts"
import type { ResolvedProcessorAccess } from "./model.ts"

export const resolveProcessorAccessCellDeclaration = declareQueryCell<
  ResolveProcessorAccessInput,
  ResolvedProcessorAccess,
  never
>({
  id: "processor.resolve-access.v1",
  authentication: "required",
  contract: resolveProcessorAccessContract,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [],
  observability: { operation: "processor.resolve_access" },
})
