import type {
  ProcessorAuthFailure,
  ProcessorCookieSessionInput,
  ProcessorLogoutOutput,
} from "../../../server/authentication/model.ts"
import { processorLogoutContract } from "./contract.ts"
import { logoutSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const processorLogoutCellDeclaration = declareCommandCell<
  ProcessorCookieSessionInput,
  ProcessorLogoutOutput,
  ProcessorAuthFailure
>({
  id: "processor.logout.v1",
  authentication: "none",
  contract: processorLogoutContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [logoutSurface],
  observability: { operation: "processor.authentication.logout" },
})
