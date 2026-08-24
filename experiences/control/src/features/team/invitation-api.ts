import type {
  ControlInvitationAcceptance,
  ControlInvitationBootstrapResult,
  ControlInvitationPreview,
} from "../../browser/contracts/invitations.ts"

export type ControlInvitationApi = Readonly<{
  preview: (token: string) => Promise<ControlInvitationPreview>
  acceptNewIdentity: (
    input: Readonly<{
      token: string
      idempotencyKey: string
      password: string
    }>,
  ) => Promise<ControlInvitationAcceptance>
  acceptExistingPassword: (
    input: Readonly<{
      token: string
      idempotencyKey: string
      password: string
    }>,
  ) => Promise<ControlInvitationBootstrapResult>
  acceptExistingMfa: (
    input: Readonly<{
      token: string
      idempotencyKey: string
      method: "totp" | "recovery"
      code: string
    }>,
  ) => Promise<ControlInvitationBootstrapResult>
}>
