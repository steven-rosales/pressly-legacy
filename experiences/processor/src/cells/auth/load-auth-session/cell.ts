import type {
  ProcessorAuthFailure,
  ProcessorCookieSessionInput,
  ProcessorSessionOutput,
} from "../../../server/authentication/model.ts"
import { processorLoadSessionContract } from "./contract.ts"
import { sessionSurface } from "./http.ts"
import { declareQueryCell } from "@pressly/cells"

export const processorLoadSessionCellDeclaration = declareQueryCell<
  ProcessorCookieSessionInput,
  ProcessorSessionOutput,
  ProcessorAuthFailure
>({
  id: "processor.load-auth-session.v1",
  authentication: "none",
  contract: processorLoadSessionContract,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [sessionSurface],
  observability: { operation: "processor.authentication.load_session" },
})
