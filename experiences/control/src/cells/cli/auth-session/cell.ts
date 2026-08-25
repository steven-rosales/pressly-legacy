import { sessionSurface } from "./cli.ts"
import { sessionContract } from "./contract.ts"
import { declareQueryCell } from "@pressly/cells"

export const adminCliAuthSessionCellDeclaration = declareQueryCell({
  id: "control.cli-auth-session.v1",
  authentication: "none",
  contract: sessionContract,
  surfaces: [sessionSurface],
  observability: { operation: "control.cli.auth_session" },
})
