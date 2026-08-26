import { defineOperation } from "@pressly/cells"
import {
  resolveProcessorAccessContract,
  type ResolveProcessorAccessInput,
} from "./contract.ts"
import type { ResolvedProcessorAccess } from "./model.ts"

export const resolveProcessorAccessCellDeclaration = defineOperation<
  ResolveProcessorAccessInput,
  ResolvedProcessorAccess,
  never
>({
  kind: "query",
  id: "processor.resolve-access.v1",
  authentication: "required",
  contract: resolveProcessorAccessContract,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [],
  observability: { operation: "processor.resolve_access" },
})
