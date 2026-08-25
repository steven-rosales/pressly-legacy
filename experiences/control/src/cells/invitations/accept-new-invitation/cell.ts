import type {
  AcceptNewInvitationInput,
  InvitationAcceptance,
  InvitationAcceptanceFailure,
} from "../../../management/invitations/contracts.ts"
import { acceptNewControlInvitationContract } from "./contract.ts"
import { acceptNewSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const acceptNewControlInvitationCellDeclaration = declareCommandCell<
  AcceptNewInvitationInput,
  InvitationAcceptance,
  InvitationAcceptanceFailure
>({
  id: "control.accept-new-invitation.v1",
  authentication: "none",
  contract: acceptNewControlInvitationContract,
  consistency: {
    transaction: "none",
    concurrency: "partitioned",
    concurrencyKey: (input) => input.acceptanceToken,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [acceptNewSurface],
  observability: { operation: "control.accept_new_invitation" },
})
