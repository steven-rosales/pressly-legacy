import {
  logoutResultSchema,
  processorAuthenticatedSessionSchema,
  processorLoginResultSchema,
} from "@pressly/contracts/auth"
import type { AuthenticationPort } from "@/ports/authentication.port"
import type { RequestPort } from "@/ports/request.port"

export const makeApiAuthenticationAdapter = (input: {
  request: RequestPort
  acceptCsrfToken: (token: string) => void
  clearCsrfToken: () => void
}): AuthenticationPort => {
  const accept = <T extends { csrfToken: string }>(session: T): T => {
    input.acceptCsrfToken(session.csrfToken)
    return session
  }

  return {
    restore: async () =>
      accept(
        await input.request(
          { path: "/processor/auth/session" },
          processorAuthenticatedSessionSchema
        )
      ),

    login: async (credentials) => {
      const outcome = await input.request(
        { method: "POST", path: "/processor/auth/login", body: credentials },
        processorLoginResultSchema
      )
      if (outcome.status === "authenticated") accept(outcome)
      else input.clearCsrfToken()
      return outcome
    },

    completeMfa: async (body) =>
      accept(
        await input.request(
          { method: "POST", path: "/processor/auth/mfa/challenge", body },
          processorAuthenticatedSessionSchema
        )
      ),

    logout: async () => {
      await input.request(
        { method: "POST", path: "/processor/auth/logout" },
        logoutResultSchema
      )
      input.clearCsrfToken()
    },
  }
}
