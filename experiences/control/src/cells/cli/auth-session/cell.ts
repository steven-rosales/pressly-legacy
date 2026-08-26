import { sessionSurface } from "./cli.ts"
import { sessionContract } from "./contract.ts"
import { defineOperation } from "@pressly/cells"

export const adminCliAuthSessionCellDeclaration = defineOperation({
  kind: "query",
  id: "control.cli-auth-session.v1",
  authentication: "none",
  contract: sessionContract,
  surfaces: [sessionSurface],
  observability: { operation: "control.cli.auth_session" },
})
