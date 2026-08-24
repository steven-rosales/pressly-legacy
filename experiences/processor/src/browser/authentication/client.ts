import {
  logoutResultSchema,
  processorAuthenticatedSessionSchema,
  processorLoginResultSchema,
} from "../../contracts/authentication-v1.ts"
import {
  strictWireCodec,
  type ProcessorBrowserRequestTransport,
} from "../transport.ts"
import type {
  ProcessorAuthenticationBrowserClient,
  ProcessorAuthenticationOperations,
} from "./types.ts"

const loginCodec = strictWireCodec(processorLoginResultSchema)
const sessionCodec = strictWireCodec(processorAuthenticatedSessionSchema)
const logoutCodec = strictWireCodec(logoutResultSchema)

export const makeProcessorAuthenticationBrowserClient = (
  input: Readonly<{
    operations: ProcessorAuthenticationOperations
    request: ProcessorBrowserRequestTransport
    acceptCsrfToken: (token: string) => void
    clearCsrfToken: () => void
  }>
): ProcessorAuthenticationBrowserClient => {
  const accept = <Session extends { csrfToken: string }>(session: Session) => {
    input.acceptCsrfToken(session.csrfToken)
    return session
  }

  return Object.freeze({
    restore: async () =>
      accept(
        await input.request(
          {
            method: input.operations.loadSession.http.session.method,
            path: input.operations.loadSession.http.session.path,
          },
          sessionCodec
        )
      ),
    login: async (credentials) => {
      const outcome = await input.request(
        {
          method: input.operations.login.http.login.method,
          path: input.operations.login.http.login.path,
          body: credentials,
        },
        loginCodec
      )
      if (outcome.status === "authenticated") accept(outcome)
      else input.clearCsrfToken()
      return outcome
    },
    completeMfa: async (body) =>
      accept(
        await input.request(
          {
            method: input.operations.completeMfaChallenge.http.challenge.method,
            path: input.operations.completeMfaChallenge.http.challenge.path,
            body,
          },
          sessionCodec
        )
      ),
    logout: async () => {
      await input.request(
        {
          method: input.operations.logout.http.logout.method,
          path: input.operations.logout.http.logout.path,
        },
        logoutCodec
      )
      input.clearCsrfToken()
    },
  })
}
