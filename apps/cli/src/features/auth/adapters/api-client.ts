import { result, type Result } from '@pressly/kernel';
import type {
  AuthenticatedLoginResult,
  LoginRequest,
  LoginResult,
  LogoutResult,
  MfaEnrollmentResult,
  MfaMutationResult,
  MfaRecoveryCodesResult,
  SessionResult,
} from '@pressly/contracts';
import { makeAppError, type AppError } from '@pressly/errors';
import {
  readApiUrl,
  requestApi,
  type ApiClientEnv,
} from '../../../shell/api-client.ts';
import {
  makeSessionStore,
  missingCliSession,
  type SessionStore,
} from '../../../shell/session-store.ts';
import type { AuthCliClient } from '../application/ports.ts';

export type AuthCliEnv = ApiClientEnv;

export const makeApiAuthClient = (
  env: AuthCliEnv,
  store: SessionStore = makeSessionStore(),
): Result<AuthCliClient, AppError> => {
  const apiUrl = readApiUrl(env);

  if (result.isErr(apiUrl)) return apiUrl;

  const readSession = async () => {
    const session = await store.read();
    if (result.isErr(session)) return result.err(session.error);
    if (session.value === undefined) return result.err(missingCliSession());
    return result.ok(session.value);
  };

  return result.ok({
    login: async (request: LoginRequest, secondFactor) => {
      const loginResult = await requestApi<LoginResult>({
        apiUrl: apiUrl.value,
        path: '/auth/login',
        method: 'POST',
        body: request,
      });

      if (result.isErr(loginResult)) return loginResult;

      let authenticated: Result<AuthenticatedLoginResult, AppError>;
      if ('status' in loginResult.value) {
        if (secondFactor === undefined)
          return result.err(
            makeAppError({
              kind: 'AuthError',
              code: 'mfa_code_required',
              message: 'Privileged login requires an MFA or recovery code.',
              safeMessage:
                'MFA is required. Use --mfa-code or --recovery-code.',
              status: 401,
            }),
          );

        authenticated = await requestApi<AuthenticatedLoginResult>({
          apiUrl: apiUrl.value,
          path: '/auth/mfa/challenge',
          method: 'POST',
          body: {
            challengeToken: loginResult.value.challengeToken,
            method: secondFactor.method,
            code: secondFactor.code,
          },
        });
      } else {
        authenticated = result.ok(loginResult.value);
      }

      if (result.isErr(authenticated)) return authenticated;

      const stored = await store.write(authenticated.value);
      if (result.isErr(stored)) return result.err(stored.error);

      return authenticated;
    },

    loadSession: async () => {
      const session = await readSession();
      if (result.isErr(session)) return session;

      return requestApi<SessionResult>({
        apiUrl: apiUrl.value,
        path: '/auth/session',
        method: 'GET',
        bearerToken: session.value.accessToken,
      });
    },

    logout: async () => {
      const session = await store.read();

      if (result.isErr(session)) return result.err(session.error);
      if (session.value === undefined) {
        const cleared = await store.clear();
        if (result.isErr(cleared)) return result.err(cleared.error);

        return result.ok({ revoked: true });
      }

      const logoutResult = await requestApi<LogoutResult>({
        apiUrl: apiUrl.value,
        path: '/auth/logout',
        method: 'POST',
        bearerToken: session.value.accessToken,
      });

      if (result.isErr(logoutResult)) return logoutResult;

      const cleared = await store.clear();
      if (result.isErr(cleared)) return result.err(cleared.error);

      return logoutResult;
    },

    beginMfaEnrollment: async () => {
      const session = await readSession();
      if (result.isErr(session)) return session;
      return requestApi<MfaEnrollmentResult>({
        apiUrl: apiUrl.value,
        path: '/auth/mfa/enrollment',
        method: 'POST',
        bearerToken: session.value.accessToken,
      });
    },

    confirmMfaEnrollment: async (code) => {
      const session = await readSession();
      if (result.isErr(session)) return session;
      return requestApi<MfaRecoveryCodesResult>({
        apiUrl: apiUrl.value,
        path: '/auth/mfa/enrollment/confirm',
        method: 'POST',
        bearerToken: session.value.accessToken,
        body: { code },
      });
    },

    regenerateMfaRecoveryCodes: async () => {
      const session = await readSession();
      if (result.isErr(session)) return session;
      return requestApi<MfaRecoveryCodesResult>({
        apiUrl: apiUrl.value,
        path: '/auth/mfa/recovery-codes/regenerate',
        method: 'POST',
        bearerToken: session.value.accessToken,
      });
    },

    removeMfa: async () => {
      const session = await readSession();
      if (result.isErr(session)) return session;
      return requestApi<MfaMutationResult>({
        apiUrl: apiUrl.value,
        path: '/auth/mfa/remove',
        method: 'POST',
        bearerToken: session.value.accessToken,
      });
    },

    close: async () => undefined,
  });
};
