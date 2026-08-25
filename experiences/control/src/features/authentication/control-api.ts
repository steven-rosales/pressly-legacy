import type {
  ControlAuthenticatedSession,
  ControlLoginResult,
} from "../../browser/contracts/authentication.ts"

export type ControlAuthenticationApi = Readonly<{
  restore: () => Promise<ControlAuthenticatedSession>
  login: (
    credentials: Readonly<{
      email: string
      password: string
    }>,
  ) => Promise<ControlLoginResult>
  completeMfa: (
    input: Readonly<{
      method: "totp" | "recovery"
      code: string
    }>,
  ) => Promise<ControlAuthenticatedSession>
  logout: () => Promise<void>
}>
