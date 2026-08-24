import type {
  ControlInvitationAcceptance,
  ControlInvitationBootstrapResult,
  ControlInvitationPreview,
} from "../contracts/invitations.ts"
import type {
  BrowserHttpSurface,
  GeneratedBrowserOperation,
} from "../transport.ts"

export type ControlInvitationOperations = Readonly<{
  previewInvitation: GeneratedBrowserOperation<
    "control.preview-invitation.v1",
    Readonly<{ preview: BrowserHttpSurface<"POST"> }>
  >
  acceptNewInvitation: GeneratedBrowserOperation<
    "control.accept-new-invitation.v1",
    Readonly<{ new: BrowserHttpSurface<"POST"> }>
  >
  acceptExistingInvitation: GeneratedBrowserOperation<
    "control.accept-existing-invitation.v1",
    Readonly<{ existing: BrowserHttpSurface<"POST"> }>
  >
  acceptExistingInvitationPassword: GeneratedBrowserOperation<
    "control.accept-existing-invitation-password.v1",
    Readonly<{ password: BrowserHttpSurface<"POST"> }>
  >
  acceptExistingInvitationMfa: GeneratedBrowserOperation<
    "control.accept-existing-invitation-mfa.v1",
    Readonly<{ mfa: BrowserHttpSurface<"POST"> }>
  >
}>

export type ControlInvitationsBrowserClient = Readonly<{
  preview: (token: string) => Promise<ControlInvitationPreview>
  acceptNewIdentity: (
    input: Readonly<{
      token: string
      idempotencyKey: string
      password: string
    }>,
  ) => Promise<ControlInvitationAcceptance>
  acceptExisting: (
    input: Readonly<{
      token: string
      idempotencyKey: string
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
