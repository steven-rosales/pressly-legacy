import type {
  ControlSessionFailure,
  ControlSessionOutput,
  CookieSessionInput,
} from "../../../auth/model/schemas.ts"
import { controlLoadSessionContract } from "./contract.ts"
import { sessionSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const controlLoadSessionCellDeclaration = defineOperation<
  CookieSessionInput,
  ControlSessionOutput,
  ControlSessionFailure
>({
  kind: "query",
  id: "control.load-auth-session.v1",
  authentication: "none",
  contract: controlLoadSessionContract,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [sessionSurface],
  observability: { operation: "control.authentication.load_session" },
})
