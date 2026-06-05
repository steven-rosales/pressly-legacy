import type {
  LoginRequest,
  LoginResult,
  LogoutResult,
  SessionResult,
} from '@pressly/contracts';
import { err, ok, type AppError, type Result } from '@pressly/errors';
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

  if (!apiUrl.ok) return apiUrl;

  return ok({
    login: async (request: LoginRequest) => {
      const result = await requestApi<LoginResult>({
        apiUrl: apiUrl.value,
        path: '/auth/login',
        method: 'POST',
        body: request,
      });

      if (!result.ok) return result;

      const stored = await store.write(result.value);
      if (!stored.ok) return err(stored.error);

      return result;
    },

    loadSession: async () => {
      const session = await store.read();

      if (!session.ok) return err(session.error);
      if (session.value === undefined) return err(missingCliSession());

      return requestApi<SessionResult>({
        apiUrl: apiUrl.value,
        path: '/auth/session',
        method: 'GET',
        bearerToken: session.value.accessToken,
      });
    },

    logout: async () => {
      const session = await store.read();

      if (!session.ok) return err(session.error);
      if (session.value === undefined) {
        const cleared = await store.clear();
        if (!cleared.ok) return err(cleared.error);

        return ok({ revoked: true });
      }

      const result = await requestApi<LogoutResult>({
        apiUrl: apiUrl.value,
        path: '/auth/logout',
        method: 'POST',
        bearerToken: session.value.accessToken,
      });

      if (!result.ok) return result;

      const cleared = await store.clear();
      if (!cleared.ok) return err(cleared.error);

      return result;
    },

    close: async () => undefined,
  });
};
