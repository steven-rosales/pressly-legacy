import {
  logoutResultSchema,
  mfaEnrollmentResultSchema,
  mfaMutationResultSchema,
  mfaRecoveryCodesResultSchema,
  revokeIdentitySessionsResultSchema,
  sessionInventoryResultSchema,
  type MfaMutationResult,
  type MfaRecoveryCodesResult,
} from "../contracts/authentication.ts"
import {
  controlBrowserLoginWireSchema,
  controlBrowserSessionWireSchema,
} from "../application-destination.ts"
import {
  renderBrowserPath,
  strictWireCodec,
  type ControlBrowserRequestTransport,
} from "../transport.ts"
import type {
  ControlAuthenticationBrowserClient,
  ControlAuthenticationOperations,
} from "./types.ts"

const loginCodec = strictWireCodec(controlBrowserLoginWireSchema)
const sessionCodec = strictWireCodec(controlBrowserSessionWireSchema)
const logoutCodec = strictWireCodec(logoutResultSchema)
const sessionInventoryCodec = strictWireCodec(sessionInventoryResultSchema)
const revokedCountCodec = strictWireCodec(revokeIdentitySessionsResultSchema)
const enrollmentCodec = strictWireCodec(mfaEnrollmentResultSchema)
const recoveryCodesCodec = strictWireCodec(mfaRecoveryCodesResultSchema)
const mfaMutationCodec = strictWireCodec(mfaMutationResultSchema)

export const makeControlAuthenticationBrowserClient = (
  input: Readonly<{
    operations: ControlAuthenticationOperations
    request: ControlBrowserRequestTransport
    acceptCsrfToken: (token: string) => void
    clearCsrfToken: () => void
  }>,
): ControlAuthenticationBrowserClient => {
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
          sessionCodec,
        ),
      ),
    login: async (credentials) => {
      const outcome = await input.request(
        {
          method: input.operations.login.http.login.method,
          path: input.operations.login.http.login.path,
          body: credentials,
        },
        loginCodec,
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
          sessionCodec,
        ),
      ),
    logout: async () => {
      await input.request(
        {
          method: input.operations.logout.http.logout.method,
          path: input.operations.logout.http.logout.path,
          csrf: true,
        },
        logoutCodec,
      )
      input.clearCsrfToken()
    },
    listIdentitySessions: (identityId) => {
      const surface = input.operations.listIdentitySessions.http.sessions
      return input.request(
        {
          method: surface.method,
          path: renderBrowserPath(surface.path, { identityId }),
        },
        sessionInventoryCodec,
      )
    },
    revokeAllIdentitySessions: (identityId) => {
      const surface =
        input.operations.revokeAllIdentitySessions.http["revoke-all"]
      return input.request(
        {
          method: surface.method,
          path: renderBrowserPath(surface.path, { identityId }),
          csrf: true,
        },
        revokedCountCodec,
      )
    },
    revokeIdentitySession: ({ identityId, sessionId }) => {
      const surface = input.operations.revokeIdentitySession.http.revoke
      return input.request(
        {
          method: surface.method,
          path: renderBrowserPath(surface.path, { identityId, sessionId }),
          csrf: true,
        },
        revokedCountCodec,
      )
    },
    beginMfaEnrollment: () => {
      const surface = input.operations.beginMfaEnrollment.http.enrollment
      return input.request(
        { method: surface.method, path: surface.path, csrf: true },
        enrollmentCodec,
      )
    },
    confirmMfaEnrollment: async (code) => {
      const surface = input.operations.confirmMfaEnrollment.http.confirm
      const result: MfaRecoveryCodesResult = await input.request(
        {
          method: surface.method,
          path: surface.path,
          body: { code },
          csrf: true,
        },
        recoveryCodesCodec,
      )
      return result.recoveryCodes
    },
    regenerateRecoveryCodes: async () => {
      const surface =
        input.operations.regenerateMfaRecoveryCodes.http.regenerate
      const result: MfaRecoveryCodesResult = await input.request(
        { method: surface.method, path: surface.path, csrf: true },
        recoveryCodesCodec,
      )
      return result.recoveryCodes
    },
    removeMfa: async () => {
      const surface = input.operations.removeMfa.http.remove
      await input.request<MfaMutationResult>(
        { method: surface.method, path: surface.path, csrf: true },
        mfaMutationCodec,
      )
    },
  })
}
