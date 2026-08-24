import type {
  ControlSessionFailure,
  ControlSessionOutput,
  CookieChallengeInput,
} from "../../../auth/model/schemas.ts"
import { controlCompleteMfaChallengeContract } from "./contract.ts"
import { challengeSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const controlCompleteMfaChallengeCellDeclaration = declareCommandCell<
  CookieChallengeInput,
  ControlSessionOutput,
  ControlSessionFailure
>({
  id: "control.complete-mfa-challenge.v1",
  authentication: "none",
  contract: controlCompleteMfaChallengeContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [challengeSurface],
  observability: { operation: "control.authentication.complete_mfa_challenge" },
})
