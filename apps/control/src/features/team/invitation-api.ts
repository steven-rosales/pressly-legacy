import {
  controlInvitationAcceptanceSchema,
  controlInvitationBootstrapResultSchema as sharedControlInvitationBootstrapResultSchema,
  controlInvitationPreviewSchema as sharedControlInvitationPreviewSchema,
  type ControlInvitationAcceptance,
  type ControlInvitationBootstrapResult,
  type ControlInvitationPreview,
} from "@pressly/contracts/auth"
import type { ControlHttpClient } from "@/api/control-http-client"
import {
  applicationDestinationSchema,
  controlAuthenticatedSessionSchema,
} from "@/authentication/control-session"

export const invitationPreviewSchema = sharedControlInvitationPreviewSchema
export const invitationAcceptanceResultSchema =
  controlInvitationAcceptanceSchema

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

export type InvitationPreview = ControlInvitationPreview
export type InvitationAcceptanceResult = ControlInvitationAcceptance
export type InvitationBootstrapResult = ControlInvitationBootstrapResult

export type ControlInvitationApi = Readonly<{
  preview: (token: string) => Promise<InvitationPreview>
  acceptNewIdentity: (input: {
    token: string
    idempotencyKey: string
    password: string
  }) => Promise<InvitationAcceptanceResult>
  acceptExistingPassword: (input: {
    token: string
    idempotencyKey: string
    password: string
  }) => Promise<InvitationBootstrapResult>
  acceptExistingMfa: (input: {
    token: string
    idempotencyKey: string
    method: "totp" | "recovery"
    code: string
  }) => Promise<InvitationBootstrapResult>
}>

export function makeControlInvitationApi(
  client: ControlHttpClient,
): ControlInvitationApi {
  const acceptBootstrapSession = (result: InvitationBootstrapResult) => {
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
        invitationPreviewSchema,
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
        invitationAcceptanceResultSchema,
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
