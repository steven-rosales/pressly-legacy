import type {
  ProcessorAuthenticatedSession,
  ProcessorLoginResult,
} from "../../contracts/authentication-v1.ts"
import type {
  GeneratedBrowserOperation,
  BrowserHttpSurface,
} from "../transport.ts"

export type ProcessorAuthenticationOperations = Readonly<{
  login: GeneratedBrowserOperation<
    "processor.auth-login.v1",
    Readonly<{ login: BrowserHttpSurface<"POST"> }>
  >
  completeMfaChallenge: GeneratedBrowserOperation<
    "processor.complete-mfa-challenge.v1",
    Readonly<{ challenge: BrowserHttpSurface<"POST"> }>
  >
  loadSession: GeneratedBrowserOperation<
    "processor.load-auth-session.v1",
    Readonly<{ session: BrowserHttpSurface<"GET"> }>
  >
  logout: GeneratedBrowserOperation<
    "processor.logout.v1",
    Readonly<{ logout: BrowserHttpSurface<"POST"> }>
  >
}>

export type ProcessorAuthenticationBrowserClient = Readonly<{
  restore: () => Promise<ProcessorAuthenticatedSession>
  login: (
    credentials: Readonly<{ email: string; password: string }>
  ) => Promise<ProcessorLoginResult>
  completeMfa: (
    input: Readonly<{
      method: "totp" | "recovery"
      code: string
    }>
  ) => Promise<ProcessorAuthenticatedSession>
  logout: () => Promise<void>
}>
