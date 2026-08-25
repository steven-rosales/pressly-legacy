import type {
  AcceptExistingMfaInput,
  InvitationBootstrapOutput,
  InvitationAcceptanceFailure,
} from "../../../management/invitations/contracts.ts"
import { acceptExistingMfaContract } from "./contract.ts"
import { mfaSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const acceptExistingMfaCellDeclaration = declareCommandCell<
  AcceptExistingMfaInput,
  InvitationBootstrapOutput,
  InvitationAcceptanceFailure
>({
  id: "control.accept-existing-invitation-mfa.v1",
  authentication: "none",
  contract: acceptExistingMfaContract,
  consistency: {
    transaction: "none",
    concurrency: "partitioned",
    concurrencyKey: (input) => input.acceptanceToken,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [mfaSurface],
  observability: { operation: "control.accept_existing_invitation_mfa" },
})
