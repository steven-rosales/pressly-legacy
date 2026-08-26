import type { RequestHandler } from 'express';
import { httpBoundaryProviderTokens } from '@pressly/topology/http';
import {
  apiJsonDocument64kbProvider,
  apiJsonDocumentProvider,
  type ApiHttpBoundaryAuthorizationProvider,
  type ApiHttpBoundaryContextProvider,
  type ApiHttpBoundaryExpectedFailureProvider,
  type ApiHttpBoundaryMiddlewareProvider,
  type ApiHttpBoundaryProviderRegistryDependencies,
} from '@pressly/http-host/runtime';
import {
  makeApiTargetOwners,
  type ApiTargetOwnerCompositionDependencies,
  type ApiTargetOwners,
} from '../../../../topology/runtime/http/bootstrap/target-owners.ts';

const clock = {
  now: () => new Date('2026-08-22T16:00:00.000Z'),
};

export const makeApiTargetOwnerFixture = (): ApiTargetOwners =>
  makeApiTargetOwners({
    db: {} as ApiTargetOwnerCompositionDependencies['db'],
    clock,
    ids: { next: () => '99000000-0000-4000-8000-000000000001' },
    access: {
      tokenSecret: 'selected-api-target-token-secret',
      sessionTtlMinutes: 30,
      loginWindowMinutes: 15,
      loginMaxFailures: 5,
      mfaChallengeTtlMinutes: 5,
      mfaChallengeMaxAttempts: 8,
      sessionIdleTimeoutMinutes: 30,
      mfaEncryptionKey: Buffer.alloc(32, 7).toString('base64'),
      mfaIssuer: 'Pressly Selected API Target',
      policies: {
        pricing: { freshSessionMaxAgeMinutes: 15 },
        authSessions: { freshSessionMaxAgeMinutes: 15 },
        mfa: { freshSessionMaxAgeMinutes: 15 },
      },
    },
    control: {
      origin: 'https://control.pressly.test',
      presentation: {
        deriveCsrfToken: () => 'control-csrf-token',
        serializeCookies: (mutations) =>
          mutations.map(
            (mutation) =>
              `control-${mutation.cookie}-${mutation.action}; Path=/`,
          ),
      },
    },
    processor: {
      origin: 'https://processor.pressly.test',
      presentation: {
        deriveCsrfToken: () => 'processor-csrf-token',
        serializeCookies: (mutations) =>
          mutations.map(
            (mutation) =>
              `processor-${mutation.cookie}-${mutation.action}; Path=/`,
          ),
      },
    },
  });

const continueRequest: RequestHandler = (_request, _response, next) => next();
const middlewareProvider: ApiHttpBoundaryMiddlewareProvider = () =>
  continueRequest;
const contextProvider: ApiHttpBoundaryContextProvider = () => Object.freeze({});
const authorizationProvider: ApiHttpBoundaryAuthorizationProvider = () =>
  undefined;
const expectedFailureProvider: ApiHttpBoundaryExpectedFailureProvider = () =>
  undefined;

const recordFrom = <Token extends string, Value>(
  tokens: readonly Token[],
  value: Value,
): Record<Token, Value> =>
  Object.fromEntries(tokens.map((token) => [token, value])) as Record<
    Token,
    Value
  >;

export const makeApiBoundaryProviderFixture =
  (): ApiHttpBoundaryProviderRegistryDependencies => ({
    requestContext: () => continueRequest,
    middleware: {
      ...recordFrom(httpBoundaryProviderTokens.middleware, middlewareProvider),
      'json-document': apiJsonDocumentProvider,
      'json-document-64kb': apiJsonDocument64kbProvider,
    },
    context: recordFrom(httpBoundaryProviderTokens.context, contextProvider),
    authorization: recordFrom(
      httpBoundaryProviderTokens.authorization,
      authorizationProvider,
    ),
    expectedFailure: recordFrom(
      httpBoundaryProviderTokens.expectedFailure,
      expectedFailureProvider,
    ),
  });
