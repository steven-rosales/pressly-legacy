import type {
  ControlAuthenticatedSession,
  ControlLoginResult,
  MfaEnrollmentResult,
  RevokeIdentitySessionsResult,
  SessionInventoryResult,
} from "../contracts/authentication.ts"
import type {
  BrowserHttpSurface,
  GeneratedBrowserOperation,
} from "../transport.ts"

export type ControlAuthenticationOperations = Readonly<{
  login: GeneratedBrowserOperation<
    "control.auth-login.v1",
    Readonly<{ login: BrowserHttpSurface<"POST"> }>
  >
  completeMfaChallenge: GeneratedBrowserOperation<
    "control.complete-mfa-challenge.v1",
    Readonly<{ challenge: BrowserHttpSurface<"POST"> }>
  >
  loadSession: GeneratedBrowserOperation<
    "control.load-auth-session.v1",
    Readonly<{ session: BrowserHttpSurface<"GET"> }>
  >
  logout: GeneratedBrowserOperation<
    "control.logout.v1",
    Readonly<{ logout: BrowserHttpSurface<"POST"> }>
  >
  listIdentitySessions: GeneratedBrowserOperation<
    "control.list-identity-sessions.v1",
    Readonly<{ sessions: BrowserHttpSurface<"GET"> }>
  >
  revokeAllIdentitySessions: GeneratedBrowserOperation<
    "control.revoke-all-identity-sessions.v1",
    Readonly<{ "revoke-all": BrowserHttpSurface<"POST"> }>
  >
  revokeIdentitySession: GeneratedBrowserOperation<
    "control.revoke-identity-session.v1",
    Readonly<{ revoke: BrowserHttpSurface<"POST"> }>
  >
  beginMfaEnrollment: GeneratedBrowserOperation<
    "control.begin-mfa-enrollment.v1",
    Readonly<{ enrollment: BrowserHttpSurface<"POST"> }>
  >
  confirmMfaEnrollment: GeneratedBrowserOperation<
    "control.confirm-mfa-enrollment.v1",
    Readonly<{ confirm: BrowserHttpSurface<"POST"> }>
  >
  regenerateMfaRecoveryCodes: GeneratedBrowserOperation<
    "control.regenerate-mfa-recovery-codes.v1",
    Readonly<{ regenerate: BrowserHttpSurface<"POST"> }>
  >
  removeMfa: GeneratedBrowserOperation<
    "control.remove-mfa.v1",
    Readonly<{ remove: BrowserHttpSurface<"POST"> }>
  >
}>

export type ControlAuthenticationBrowserClient = Readonly<{
  restore: () => Promise<ControlAuthenticatedSession>
  login: (
    credentials: Readonly<{ email: string; password: string }>,
  ) => Promise<ControlLoginResult>
  completeMfa: (
    input: Readonly<{
      method: "totp" | "recovery"
      code: string
    }>,
  ) => Promise<ControlAuthenticatedSession>
  logout: () => Promise<void>
  listIdentitySessions: (identityId: string) => Promise<SessionInventoryResult>
  revokeAllIdentitySessions: (
    identityId: string,
  ) => Promise<RevokeIdentitySessionsResult>
  revokeIdentitySession: (
    input: Readonly<{
      identityId: string
      sessionId: string
    }>,
  ) => Promise<RevokeIdentitySessionsResult>
  beginMfaEnrollment: () => Promise<MfaEnrollmentResult>
  confirmMfaEnrollment: (code: string) => Promise<readonly string[]>
  regenerateRecoveryCodes: () => Promise<readonly string[]>
  removeMfa: () => Promise<void>
}>
