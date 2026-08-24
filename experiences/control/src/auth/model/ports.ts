import type { AccessSuccess } from "./access.ts"
import type { ControlAccess } from "./schemas.ts"

export type ControlCookieMutation =
  | Readonly<{ action: "clear"; cookie: "mfa" | "session" }>
  | Readonly<{
      action: "set"
      cookie: "mfa" | "session"
      value: string
      expiresAt: Date
    }>

export type ControlBrowserPresentation = Readonly<{
  deriveCsrfToken: (sessionToken: string) => string
  serializeCookies: (
    mutations: readonly ControlCookieMutation[],
  ) => readonly string[]
}>

export type ResolveControlAccess = (
  session: AccessSuccess<"loadSession">,
) => Promise<ControlAccess | null>
