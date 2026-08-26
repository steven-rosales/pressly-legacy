import type {
  ProcessorAuthFailure,
  ProcessorCookieSessionInput,
  ProcessorSessionOutput,
} from "../../../server/authentication/model.ts"
import { processorLoadSessionContract } from "./contract.ts"
import { sessionSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const processorLoadSessionCellDeclaration = defineOperation<
  ProcessorCookieSessionInput,
  ProcessorSessionOutput,
  ProcessorAuthFailure
>({
  kind: "query",
  id: "processor.load-auth-session.v1",
  authentication: "none",
  contract: processorLoadSessionContract,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [sessionSurface],
  observability: { operation: "processor.authentication.load_session" },
})
