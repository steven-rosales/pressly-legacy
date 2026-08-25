import type {
  ProcessorAuthFailure,
  ProcessorChallengeInput,
  ProcessorSessionOutput,
} from "../../../server/authentication/model.ts"
import { processorCompleteMfaChallengeContract } from "./contract.ts"
import { challengeSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const processorCompleteMfaChallengeCellDeclaration = declareCommandCell<
  ProcessorChallengeInput,
  ProcessorSessionOutput,
  ProcessorAuthFailure
>({
  id: "processor.complete-mfa-challenge.v1",
  authentication: "none",
  contract: processorCompleteMfaChallengeContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [challengeSurface],
  observability: {
    operation: "processor.authentication.complete_mfa_challenge",
  },
})
