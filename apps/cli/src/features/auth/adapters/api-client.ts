import { result, type Result } from '@pressly/kernel';
import type {
  LoginRequest,
  LoginResult,
  LogoutResult,
  SessionResult,
} from '@pressly/contracts';
import { type AppError } from '@pressly/errors';
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

  return result.ok({
    login: async (request: LoginRequest) => {
      const loginResult = await requestApi<LoginResult>({
        apiUrl: apiUrl.value,
        path: '/auth/login',
        method: 'POST',
        body: request,
      });

      if (result.isErr(loginResult)) return loginResult;

      const stored = await store.write(loginResult.value);
      if (result.isErr(stored)) return result.err(stored.error);

      return loginResult;
    },

    loadSession: async () => {
      const session = await store.read();

      if (result.isErr(session)) return result.err(session.error);
      if (session.value === undefined) return result.err(missingCliSession());

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

    close: async () => undefined,
  });
};
