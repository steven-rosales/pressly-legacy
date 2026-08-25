import type {
  AcceptExistingPasswordInput,
  InvitationBootstrapOutput,
  InvitationFailure,
} from "../../../management/invitations/contracts.ts"
import { acceptExistingPasswordContract } from "./contract.ts"
import { passwordSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const acceptExistingPasswordCellDeclaration = declareCommandCell<
  AcceptExistingPasswordInput,
  InvitationBootstrapOutput,
  InvitationFailure
>({
  id: "control.accept-existing-invitation-password.v1",
  authentication: "none",
  contract: acceptExistingPasswordContract,
  consistency: {
    transaction: "none",
    concurrency: "partitioned",
    concurrencyKey: (input) => input.acceptanceToken,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [passwordSurface],
  observability: { operation: "control.accept_existing_invitation_password" },
})
