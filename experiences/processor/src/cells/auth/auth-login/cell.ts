import type {
  ProcessorAuthFailure,
  ProcessorLoginInput,
  ProcessorLoginOutput,
} from "../../../server/authentication/model.ts"
import { processorLoginContract } from "./contract.ts"
import { loginSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const processorLoginCellDeclaration = defineOperation<
  ProcessorLoginInput,
  ProcessorLoginOutput,
  ProcessorAuthFailure
>({
  kind: "command",
  id: "processor.auth-login.v1",
  authentication: "none",
  contract: processorLoginContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [loginSurface],
  observability: { operation: "processor.authentication.login" },
})
