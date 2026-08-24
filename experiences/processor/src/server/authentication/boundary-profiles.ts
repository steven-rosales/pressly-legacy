import {
  defineHttpBoundaryProfile,
  type HttpBoundaryProfile,
} from "@pressly/cells"

export type ProcessorAuthBoundaryRequirement = Readonly<{
  operationId: string
  profile: HttpBoundaryProfile
}>

const profile = (input: {
  id: string
  body: boolean
  exactOrigin: boolean
  csrf: boolean
  requestRateLimit: string | null
  contextProviders: readonly string[]
  expectedFailureObservation: boolean
}): HttpBoundaryProfile =>
  defineHttpBoundaryProfile({
    id: input.id,
    authentication: null,
    requestBody: {
      acceptedContentTypes: ["application/json"],
      ...(!input.body ? { contentType: "parse-if-matching" as const } : {}),
      parser: "json-document",
      phase: "before-authentication",
    },
    exactOrigin: input.exactOrigin ? "processor-exact-origin" : null,
    csrf: input.csrf ? "processor-cookie-csrf" : null,
    requestRateLimit: input.requestRateLimit,
    identityRateLimit: null,
    inputValidationPhase: "after-authentication",
    noStore: true,
    contextProviders: input.contextProviders,
    authorization: null,
    expectedFailureObservation: input.expectedFailureObservation
      ? "cookie-auth-failure"
      : null,
  })

export const processorAuthBoundaryRequirements = Object.freeze([
  {
    operationId: "processor.auth-login.v1",
    profile: profile({
      id: "processor.auth-login.http.v1",
      body: true,
      exactOrigin: true,
      csrf: false,
      requestRateLimit: "processor_auth_login",
      contextProviders: ["request-metadata"],
      expectedFailureObservation: true,
    }),
  },
  {
    operationId: "processor.complete-mfa-challenge.v1",
    profile: profile({
      id: "processor.complete-mfa-challenge.http.v1",
      body: true,
      exactOrigin: true,
      csrf: false,
      requestRateLimit: null,
      contextProviders: ["processor-mfa-cookie", "request-metadata"],
      expectedFailureObservation: true,
    }),
  },
  {
    operationId: "processor.load-auth-session.v1",
    profile: profile({
      id: "processor.load-auth-session.http.v1",
      body: false,
      exactOrigin: false,
      csrf: false,
      requestRateLimit: null,
      contextProviders: ["processor-session-cookie", "request-metadata"],
      expectedFailureObservation: true,
    }),
  },
  {
    operationId: "processor.logout.v1",
    profile: profile({
      id: "processor.logout.http.v1",
      body: false,
      exactOrigin: true,
      csrf: true,
      requestRateLimit: null,
      contextProviders: ["processor-session-cookie", "request-metadata"],
      expectedFailureObservation: true,
    }),
  },
]) satisfies readonly ProcessorAuthBoundaryRequirement[]

export const processorAuthBoundaryProfiles = Object.freeze(
  Object.fromEntries(
    processorAuthBoundaryRequirements.map((requirement) => [
      requirement.operationId,
      requirement.profile,
    ])
  )
)
