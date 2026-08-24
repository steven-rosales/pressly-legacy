import {
  defineHttpBoundaryProfile,
  type HttpBoundaryProfile,
} from "@pressly/cells"

export type ControlManagementBoundaryRequirement = Readonly<{
  operationId: string
  profile: HttpBoundaryProfile
}>

const define = (
  id: string,
  definition: Omit<HttpBoundaryProfile, "id">,
): HttpBoundaryProfile => defineHttpBoundaryProfile({ id, ...definition })

const protectedProfile = (input: {
  operationId: string
  mutating: boolean
}): ControlManagementBoundaryRequirement => ({
  operationId: input.operationId,
  profile: define(`${input.operationId}.http`, {
    authentication: { provider: "control-cookie-session", required: true },
    requestBody: {
      acceptedContentTypes: ["application/json"],
      contentType: "parse-if-matching",
      parser: "json-document",
      phase: "before-authentication",
    },
    exactOrigin: input.mutating ? "control-exact-origin" : null,
    csrf: input.mutating ? "control-cookie-csrf" : null,
    requestRateLimit: "control-boundary",
    identityRateLimit: "control-identity",
    inputValidationPhase: "after-authorization",
    noStore: false,
    contextProviders: ["control-request-context"],
    authorization: "control-capability",
    expectedFailureObservation: null,
  }),
})

const protectedOperations = [
  ["control.list-customers.v1", false],
  ["control.get-customer.v1", false],
  ["control.create-customer.v1", true],
  ["control.update-customer.v1", true],
  ["control.list-orders.v1", false],
  ["control.get-order.v1", false],
  ["control.create-order.v1", true],
  ["control.correct-order.v1", true],
  ["control.list-members.v1", false],
  ["control.get-member.v1", false],
  ["control.list-member-sessions.v1", false],
  ["control.revoke-member-sessions.v1", true],
  ["control.list-invitations.v1", false],
  ["control.issue-invitation.v1", true],
  ["control.reissue-invitation.v1", true],
  ["control.revoke-invitation.v1", true],
  ["control.suspend-membership.v1", true],
  ["control.reactivate-membership.v1", true],
  ["control.end-membership.v1", true],
  ["control.grant-access.v1", true],
  ["control.revoke-access.v1", true],
  ["control.list-security-events.v1", false],
] as const

const publicInvitationProfile = (input: {
  operationId: string
  contextProviders: readonly string[]
  expectedFailureObservation?: string
}): ControlManagementBoundaryRequirement => ({
  operationId: input.operationId,
  profile: define(`${input.operationId}.http`, {
    authentication: null,
    requestBody: {
      acceptedContentTypes: ["application/json"],
      contentType: "required",
      parser: "json-document",
      phase: "before-authentication",
    },
    exactOrigin: "control-exact-origin",
    csrf: null,
    requestRateLimit: "control-invitation-accept-rate-chain",
    identityRateLimit: null,
    inputValidationPhase: "after-authentication",
    noStore: false,
    contextProviders: input.contextProviders,
    authorization: null,
    expectedFailureObservation: input.expectedFailureObservation ?? null,
  }),
})

export const controlManagementBoundaryRequirements = Object.freeze([
  ...protectedOperations.map(([operationId, mutating]) =>
    protectedProfile({ operationId, mutating }),
  ),
  publicInvitationProfile({
    operationId: "control.preview-invitation.v1",
    contextProviders: [],
  }),
  publicInvitationProfile({
    operationId: "control.accept-new-invitation.v1",
    contextProviders: [],
  }),
  publicInvitationProfile({
    operationId: "control.accept-existing-invitation-password.v1",
    contextProviders: ["request-metadata"],
    expectedFailureObservation: "cookie-auth-failure",
  }),
  publicInvitationProfile({
    operationId: "control.accept-existing-invitation-mfa.v1",
    contextProviders: ["control-mfa-cookie", "request-metadata"],
    expectedFailureObservation: "cookie-auth-failure",
  }),
  {
    operationId: "control.accept-existing-invitation.v1",
    profile: define("control.accept-existing-invitation.v1.http", {
      authentication: { provider: "control-cookie-session", required: true },
      requestBody: {
        acceptedContentTypes: ["application/json"],
        contentType: "required",
        parser: "json-document",
        phase: "before-authentication",
      },
      exactOrigin: "control-exact-origin",
      csrf: "control-cookie-csrf",
      requestRateLimit: "control-invitation-accept-rate-chain",
      identityRateLimit: "control-identity",
      inputValidationPhase: "after-authentication",
      noStore: false,
      contextProviders: ["control-request-context"],
      authorization: null,
      expectedFailureObservation: null,
    }),
  },
]) satisfies readonly ControlManagementBoundaryRequirement[]

export const controlManagementBoundaryProfiles = Object.freeze(
  Object.fromEntries(
    controlManagementBoundaryRequirements.map((requirement) => [
      requirement.operationId,
      requirement.profile,
    ]),
  ),
)
