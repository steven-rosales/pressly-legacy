import type {
  AcceptExistingInvitationInput,
  InvitationAcceptance,
  InvitationAcceptanceFailure,
} from "../../../management/invitations/contracts.ts"
import { acceptExistingControlInvitationContract } from "./contract.ts"
import { acceptExistingSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const acceptExistingControlInvitationCellDeclaration =
  declareCommandCell<
    AcceptExistingInvitationInput,
    InvitationAcceptance,
    InvitationAcceptanceFailure
  >({
    id: "control.accept-existing-invitation.v1",
    authentication: "required",
    contract: acceptExistingControlInvitationContract,
    consistency: {
      transaction: "none",
      concurrency: "partitioned",
      concurrencyKey: (input) => input.acceptanceToken,
    },
    idempotency: { required: true, key: (input) => input.idempotencyKey },
    surfaces: [acceptExistingSurface],
    observability: { operation: "control.accept_existing_invitation" },
  })
