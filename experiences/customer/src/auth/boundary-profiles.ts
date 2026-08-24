import {
  defineHttpBoundaryProfile,
  type HttpBoundaryProfile,
} from '@pressly/cells';

export type CustomerAuthBoundaryRequirement = Readonly<{
  operationId: string;
  profile: HttpBoundaryProfile;
}>;

const profile = (
  id: string,
  input: Omit<HttpBoundaryProfile, 'id'>,
): HttpBoundaryProfile => defineHttpBoundaryProfile({ id, ...input });

const publicProfile = (
  id: string,
  input: Readonly<{
    bodyLimit: '4kb' | '8kb' | null;
    contextProviders?: readonly string[];
    conditionalJson?: boolean;
  }>,
): HttpBoundaryProfile =>
  profile(id, {
    authentication: null,
    requestBody:
      input.bodyLimit === null && !input.conditionalJson
        ? null
        : {
            acceptedContentTypes: ['application/json'],
            ...(input.conditionalJson
              ? { contentType: 'parse-if-matching' as const }
              : {}),
            parser: 'json-document',
            phase: 'before-authentication',
          },
    exactOrigin: null,
    csrf: null,
    requestRateLimit:
      id === 'customer.auth-login.http.v1' ? 'auth_login' : null,
    identityRateLimit: null,
    inputValidationPhase: 'before-authentication',
    noStore: false,
    contextProviders: input.contextProviders ?? [],
    authorization: null,
    expectedFailureObservation: null,
  });

const bearerProfile = (
  id: string,
  input: Readonly<{
    body: boolean;
    contextProviders: readonly string[];
  }>,
): HttpBoundaryProfile =>
  profile(id, {
    authentication: { provider: 'bearer-session', required: true },
    requestBody: {
      acceptedContentTypes: ['application/json'],
      ...(!input.body ? { contentType: 'parse-if-matching' as const } : {}),
      parser: 'json-document',
      phase: 'before-authentication',
    },
    exactOrigin: null,
    csrf: null,
    requestRateLimit: null,
    identityRateLimit: null,
    inputValidationPhase: 'before-authentication',
    noStore: false,
    contextProviders: input.contextProviders,
    authorization: 'access-policy',
    expectedFailureObservation: null,
  });

export const customerAuthBoundaryRequirements = Object.freeze([
  {
    operationId: 'customer.auth-login.v1',
    profile: publicProfile('customer.auth-login.http.v1', {
      bodyLimit: '8kb',
      contextProviders: ['request-metadata'],
    }),
  },
  {
    operationId: 'customer.load-auth-session.v1',
    profile: publicProfile('customer.load-auth-session.http.v1', {
      bodyLimit: null,
      conditionalJson: true,
    }),
  },
  {
    operationId: 'customer.logout.v1',
    profile: publicProfile('customer.logout.http.v1', {
      bodyLimit: null,
      contextProviders: ['request-metadata'],
      conditionalJson: true,
    }),
  },
  {
    operationId: 'customer.complete-mfa-challenge.v1',
    profile: publicProfile('customer.complete-mfa-challenge.http.v1', {
      bodyLimit: '4kb',
      contextProviders: ['request-metadata'],
    }),
  },
  ...[
    ['customer.list-identity-sessions.v1', false],
    ['customer.revoke-all-identity-sessions.v1', false],
    ['customer.revoke-identity-session.v1', false],
    ['customer.begin-mfa-enrollment.v1', false],
    ['customer.confirm-mfa-enrollment.v1', true],
    ['customer.regenerate-mfa-recovery-codes.v1', false],
    ['customer.remove-mfa.v1', false],
  ].map(([operationId, body]) => ({
    operationId: operationId as string,
    profile: bearerProfile(`${String(operationId)}.http`, {
      body: body as boolean,
      contextProviders: ['authenticated-principal', 'request-metadata'],
    }),
  })),
]) satisfies readonly CustomerAuthBoundaryRequirement[];

export const customerAuthBoundaryProfiles = Object.freeze(
  Object.fromEntries(
    customerAuthBoundaryRequirements.map((requirement) => [
      requirement.operationId,
      requirement.profile,
    ]),
  ),
);
