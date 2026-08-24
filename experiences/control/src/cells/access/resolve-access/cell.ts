import { declareQueryCell } from "@pressly/cells"
import type { ControlAccess } from "../../../auth/model/schemas.ts"
import {
  resolveControlAccessContract,
  type ResolveControlAccessInput,
} from "./contract.ts"

export const resolveControlAccessCellDeclaration = declareQueryCell<
  ResolveControlAccessInput,
  ControlAccess | null,
  never
>({
  id: "control.resolve-access.v1",
  authentication: "required",
  contract: resolveControlAccessContract,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [],
  observability: { operation: "control.resolve_access" },
})
