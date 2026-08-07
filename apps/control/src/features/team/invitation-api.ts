import {
  controlInvitationAcceptanceSchema,
  controlInvitationBootstrapResultSchema as sharedControlInvitationBootstrapResultSchema,
  controlInvitationPreviewSchema,
  type ControlInvitationAcceptance,
  type ControlInvitationBootstrapResult,
  type ControlInvitationPreview,
} from "@pressly/contracts/auth"
import type { ControlHttpClient } from "@/api/control-http-client"
import {
  applicationDestinationSchema,
  controlAuthenticatedSessionSchema,
} from "@/authentication/control-session"

const invitationBootstrapResultSchema =
  sharedControlInvitationBootstrapResultSchema.superRefine(
    (result, context) => {
      if (result.status !== "accepted") return

      const destination = applicationDestinationSchema.safeParse(
        result.destination,
      )
      if (!destination.success)
        context.addIssue({
          code: "custom",
          path: ["destination"],
          message: "Application destination is not allowlisted.",
        })

      if (result.session === null) return
      const session = controlAuthenticatedSessionSchema.safeParse(
        result.session,
      )
      if (!session.success)
        context.addIssue({
          code: "custom",
          path: ["session"],
          message: "Control session destinations are not allowlisted.",
        })
    },
  )

export type ControlInvitationApi = Readonly<{
  preview: (token: string) => Promise<ControlInvitationPreview>
  acceptNewIdentity: (input: {
    token: string
    idempotencyKey: string
    password: string
  }) => Promise<ControlInvitationAcceptance>
  acceptExistingPassword: (input: {
    token: string
    idempotencyKey: string
    password: string
  }) => Promise<ControlInvitationBootstrapResult>
  acceptExistingMfa: (input: {
    token: string
    idempotencyKey: string
    method: "totp" | "recovery"
    code: string
  }) => Promise<ControlInvitationBootstrapResult>
}>

export function makeControlInvitationApi(
  client: ControlHttpClient,
): ControlInvitationApi {
  const acceptBootstrapSession = (result: ControlInvitationBootstrapResult) => {
    if (result.status === "accepted" && result.session !== null)
      client.acceptCsrfToken(result.session.csrfToken)
    return result
  }

  return {
    preview: (acceptanceToken) =>
      client.request(
        {
          method: "POST",
          path: "/control/invitations/preview",
          body: { acceptanceToken },
        },
        controlInvitationPreviewSchema,
      ),
    acceptNewIdentity: ({ token, idempotencyKey, password }) =>
      client.request(
        {
          method: "POST",
          path: "/control/invitations/accept/new",
          body: {
            identityMode: "new_identity",
            idempotencyKey,
            acceptanceToken: token,
            password,
          },
        },
        controlInvitationAcceptanceSchema,
      ),
    acceptExistingPassword: async ({ token, idempotencyKey, password }) =>
      acceptBootstrapSession(
        await client.request(
          {
            method: "POST",
            path: "/control/invitations/accept/existing/password",
            body: {
              acceptanceToken: token,
              idempotencyKey,
              password,
            },
          },
          invitationBootstrapResultSchema,
        ),
      ),
    acceptExistingMfa: async ({ token, idempotencyKey, method, code }) =>
      acceptBootstrapSession(
        await client.request(
          {
            method: "POST",
            path: "/control/invitations/accept/existing/mfa",
            body: {
              acceptanceToken: token,
              idempotencyKey,
              method,
              code,
            },
          },
          invitationBootstrapResultSchema,
        ),
      ),
  }
}
