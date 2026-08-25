import {
  defineHttpBoundaryProfile,
  type HttpBoundaryProfile,
} from "@pressly/cells"

export type ControlAuthBoundaryRequirement = Readonly<{
  operationId: string
  profile: HttpBoundaryProfile
}>

const define = (
  id: string,
  definition: Omit<HttpBoundaryProfile, "id">,
): HttpBoundaryProfile => defineHttpBoundaryProfile({ id, ...definition })

const profile = (input: {
  id: string
  authenticated: boolean
  authorization: boolean
  bodyLimit: "4kb" | "8kb" | null
  exactOrigin: boolean
  csrf: boolean
  contextProviders: readonly string[]
  inputValidationPhase?:
    | "after-authentication"
    | "after-authorization"
    | "before-authentication"
  requestRateLimit: string | null
  conditionalJson?: boolean
  expectedFailureObservation?: string | null
}) =>
  define(input.id, {
    authentication: input.authenticated
      ? { provider: "control-cookie-session", required: true }
      : null,
    requestBody:
      input.bodyLimit === null && !input.conditionalJson
        ? null
        : {
            acceptedContentTypes: ["application/json"],
            ...(input.conditionalJson
              ? { contentType: "parse-if-matching" as const }
              : {}),
            parser: "json-document",
            phase: "before-authentication",
          },
    exactOrigin: input.exactOrigin ? "control-exact-origin" : null,
    csrf: input.csrf ? "control-cookie-csrf" : null,
    requestRateLimit: input.requestRateLimit,
    identityRateLimit: null,
    inputValidationPhase: input.inputValidationPhase ?? "after-authentication",
    noStore: true,
    contextProviders: input.contextProviders,
    authorization: input.authorization ? "access-policy" : null,
    expectedFailureObservation: input.expectedFailureObservation ?? null,
  })

const cliAuthApiProfile = (input: {
  id: string
  body: boolean
}): HttpBoundaryProfile =>
  define(input.id, {
    authentication: { provider: "control-bearer-session", required: true },
    requestBody: {
      acceptedContentTypes: ["application/json"],
      ...(!input.body ? { contentType: "parse-if-matching" as const } : {}),
      parser: "json-document",
      phase: "before-authentication",
    },
    exactOrigin: null,
    csrf: null,
    requestRateLimit: "control-boundary",
    identityRateLimit: "control-identity",
    inputValidationPhase: "before-authentication",
    noStore: true,
    contextProviders: ["authenticated-principal", "request-metadata"],
    authorization: "access-policy",
    expectedFailureObservation: null,
  })

export const controlCliAuthApiBoundaryRequirements = Object.freeze([
  {
    operationId: "control.cli-auth-api-login.v1",
    profile: profile({
      id: "control.cli-auth-api-login.http.v1",
      authenticated: false,
      authorization: false,
      bodyLimit: "8kb",
      exactOrigin: false,
      csrf: false,
      contextProviders: ["request-metadata"],
      inputValidationPhase: "before-authentication",
      requestRateLimit: "control-auth-login-rate-chain",
    }),
  },
  {
    operationId: "control.cli-auth-api-complete-mfa-challenge.v1",
    profile: profile({
      id: "control.cli-auth-api-complete-mfa-challenge.http.v1",
      authenticated: false,
      authorization: false,
      bodyLimit: "4kb",
      exactOrigin: false,
      csrf: false,
      contextProviders: ["request-metadata"],
      inputValidationPhase: "before-authentication",
      requestRateLimit: "control-boundary",
    }),
  },
  {
    operationId: "control.cli-auth-api-load-session.v1",
    profile: profile({
      id: "control.cli-auth-api-load-session.http.v1",
      authenticated: false,
      authorization: false,
      bodyLimit: null,
      exactOrigin: false,
      csrf: false,
      contextProviders: [],
      inputValidationPhase: "before-authentication",
      requestRateLimit: "control-boundary",
      conditionalJson: true,
    }),
  },
  {
    operationId: "control.cli-auth-api-logout.v1",
    profile: profile({
      id: "control.cli-auth-api-logout.http.v1",
      authenticated: false,
      authorization: false,
      bodyLimit: null,
      exactOrigin: false,
      csrf: false,
      contextProviders: ["request-metadata"],
      inputValidationPhase: "before-authentication",
      requestRateLimit: "control-boundary",
      conditionalJson: true,
    }),
  },
  ...[
    ["control.cli-auth-api-begin-mfa-enrollment.v1", false],
    ["control.cli-auth-api-confirm-mfa-enrollment.v1", true],
    ["control.cli-auth-api-regenerate-mfa-recovery-codes.v1", false],
    ["control.cli-auth-api-remove-mfa.v1", false],
  ].map(([operationId, body]) => ({
    operationId: String(operationId),
    profile: cliAuthApiProfile({
      id: `${String(operationId)}.http`,
      body: Boolean(body),
    }),
  })),
]) satisfies readonly ControlAuthBoundaryRequirement[]

export const controlAuthBoundaryRequirements = Object.freeze([
  {
    operationId: "control.auth-login.v1",
    profile: profile({
      id: "control.auth-login.http.v1",
      authenticated: false,
      authorization: false,
      bodyLimit: "8kb",
      exactOrigin: true,
      csrf: false,
      contextProviders: ["request-metadata"],
      inputValidationPhase: "after-authentication",
      requestRateLimit: "control-auth-login-rate-chain",
      expectedFailureObservation: "cookie-auth-failure",
    }),
  },
  {
    operationId: "control.complete-mfa-challenge.v1",
    profile: profile({
      id: "control.complete-mfa-challenge.http.v1",
      authenticated: false,
      authorization: false,
      bodyLimit: "4kb",
      exactOrigin: true,
      csrf: false,
      contextProviders: ["control-mfa-cookie", "request-metadata"],
      inputValidationPhase: "after-authentication",
      requestRateLimit: "control-boundary",
      expectedFailureObservation: "cookie-auth-failure",
    }),
  },
  {
    operationId: "control.load-auth-session.v1",
    profile: profile({
      id: "control.load-auth-session.http.v1",
      authenticated: false,
      authorization: false,
      bodyLimit: null,
      exactOrigin: false,
      csrf: false,
      contextProviders: ["control-session-cookie", "request-metadata"],
      requestRateLimit: "control-boundary",
      conditionalJson: true,
      expectedFailureObservation: "cookie-auth-failure",
    }),
  },
  {
    operationId: "control.logout.v1",
    profile: profile({
      id: "control.logout.http.v1",
      authenticated: false,
      authorization: false,
      bodyLimit: null,
      exactOrigin: true,
      csrf: true,
      contextProviders: ["control-session-cookie", "request-metadata"],
      requestRateLimit: "control-boundary",
      conditionalJson: true,
      expectedFailureObservation: "cookie-auth-failure",
    }),
  },
  ...[
    ["control.list-identity-sessions.v1", false, false],
    ["control.revoke-all-identity-sessions.v1", false, true],
    ["control.revoke-identity-session.v1", false, true],
    ["control.begin-mfa-enrollment.v1", false, true],
    ["control.confirm-mfa-enrollment.v1", true, true],
    ["control.regenerate-mfa-recovery-codes.v1", false, true],
    ["control.remove-mfa.v1", false, true],
  ].map(([operationId, body, mutating]) => ({
    operationId: String(operationId),
    profile: profile({
      id: `${String(operationId)}.http`,
      authenticated: true,
      authorization: true,
      bodyLimit: body ? "4kb" : null,
      exactOrigin: Boolean(mutating),
      csrf: Boolean(mutating),
      contextProviders: ["authenticated-principal", "request-metadata"],
      inputValidationPhase:
        String(operationId).includes("begin-mfa") ||
        String(operationId).includes("regenerate") ||
        String(operationId).includes("remove-mfa")
          ? "after-authentication"
          : "before-authentication",
      requestRateLimit: "control-boundary",
      conditionalJson: !body,
    }),
  })),
]) satisfies readonly ControlAuthBoundaryRequirement[]

export const controlAuthBoundaryProfiles = Object.freeze(
  Object.fromEntries(
    controlAuthBoundaryRequirements.map((requirement) => [
      requirement.operationId,
      requirement.profile,
    ]),
  ),
)

export const controlCliAuthApiBoundaryProfiles = Object.freeze(
  Object.fromEntries(
    controlCliAuthApiBoundaryRequirements.map((requirement) => [
      requirement.operationId,
      requirement.profile,
    ]),
  ),
)
