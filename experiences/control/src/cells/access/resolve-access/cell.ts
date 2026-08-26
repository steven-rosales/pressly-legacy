import { defineOperation } from "@pressly/cells"
import type { ControlAccess } from "../../../auth/model/schemas.ts"
import {
  resolveControlAccessContract,
  type ResolveControlAccessInput,
} from "./contract.ts"

export const resolveControlAccessCellDeclaration = defineOperation<
  ResolveControlAccessInput,
  ControlAccess | null,
  never
>({
  kind: "query",
  id: "control.resolve-access.v1",
  authentication: "required",
  contract: resolveControlAccessContract,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [],
  observability: { operation: "control.resolve_access" },
})
