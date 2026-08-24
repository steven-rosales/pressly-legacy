import {
  controlInvitationAcceptanceSchema,
  controlInvitationPreviewSchema,
} from "../contracts/invitations.ts"
import { controlInvitationBootstrapWireSchema } from "../application-destination.ts"
import {
  strictWireCodec,
  type ControlBrowserRequestTransport,
} from "../transport.ts"
import type {
  ControlInvitationOperations,
  ControlInvitationsBrowserClient,
} from "./types.ts"

const bootstrapCodec = strictWireCodec(controlInvitationBootstrapWireSchema)
const previewCodec = strictWireCodec(controlInvitationPreviewSchema)
const acceptanceCodec = strictWireCodec(controlInvitationAcceptanceSchema)

export const makeControlInvitationsBrowserClient = (
  input: Readonly<{
    operations: ControlInvitationOperations
    request: ControlBrowserRequestTransport
    acceptCsrfToken: (token: string) => void
  }>,
): ControlInvitationsBrowserClient => {
  const acceptSession = <
    Result extends Awaited<
      ReturnType<ControlInvitationsBrowserClient["acceptExistingPassword"]>
    >,
  >(
    result: Result,
  ): Result => {
    if (result.status === "accepted" && result.session !== null)
      input.acceptCsrfToken(result.session.csrfToken)
    return result
  }

  return Object.freeze({
    preview: (acceptanceToken) => {
      const surface = input.operations.previewInvitation.http.preview
      return input.request(
        {
          method: surface.method,
          path: surface.path,
          body: { acceptanceToken },
        },
        previewCodec,
      )
    },
    acceptNewIdentity: ({ token, idempotencyKey, password }) => {
      const surface = input.operations.acceptNewInvitation.http.new
      return input.request(
        {
          method: surface.method,
          path: surface.path,
          body: {
            identityMode: "new_identity",
            idempotencyKey,
            acceptanceToken: token,
            password,
          },
        },
        acceptanceCodec,
      )
    },
    acceptExisting: ({ token, idempotencyKey }) => {
      const surface = input.operations.acceptExistingInvitation.http.existing
      return input.request(
        {
          method: surface.method,
          path: surface.path,
          body: {
            identityMode: "existing_identity",
            idempotencyKey,
            acceptanceToken: token,
          },
          csrf: true,
        },
        acceptanceCodec,
      )
    },
    acceptExistingPassword: async ({ token, idempotencyKey, password }) => {
      const surface =
        input.operations.acceptExistingInvitationPassword.http.password
      return acceptSession(
        await input.request(
          {
            method: surface.method,
            path: surface.path,
            body: {
              acceptanceToken: token,
              idempotencyKey,
              password,
            },
          },
          bootstrapCodec,
        ),
      )
    },
    acceptExistingMfa: async ({ token, idempotencyKey, method, code }) => {
      const surface = input.operations.acceptExistingInvitationMfa.http.mfa
      return acceptSession(
        await input.request(
          {
            method: surface.method,
            path: surface.path,
            body: {
              acceptanceToken: token,
              idempotencyKey,
              method,
              code,
            },
          },
          bootstrapCodec,
        ),
      )
    },
  })
}
