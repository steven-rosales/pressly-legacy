import { result, type Result } from '@pressly/kernel';
import type {
  LoadPricingCatalogResult,
  PricingChangePlan,
  PublishPricingChangeResult,
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
import type { PricingClient } from '../application/ports.ts';

export type PricingCliEnv = ApiClientEnv;

export const makeApiPricingClient = (
  env: PricingCliEnv,
  store: SessionStore = makeSessionStore(),
): Result<PricingClient, AppError> => {
  const apiUrl = readApiUrl(env);

  if (result.isErr(apiUrl)) return apiUrl;

  const readToken = async (): Promise<Result<string, AppError>> => {
    const session = await store.read();

    if (result.isErr(session)) return result.err(session.error);
    if (session.value === undefined) return result.err(missingCliSession());

    return result.ok(session.value.accessToken);
  };

  return result.ok({
    loadCatalog: async (command) => {
      const token = await readToken();

      if (result.isErr(token)) return token;

      return requestApi<LoadPricingCatalogResult>({
        apiUrl: apiUrl.value,
        path: `/pricing/services/${encodeURIComponent(
          command.serviceSlug,
        )}/pricing`,
        method: 'GET',
        bearerToken: token.value,
      });
    },

    planChange: async (input) => {
      const token = await readToken();

      if (result.isErr(token)) return token;

      return requestApi<PricingChangePlan>({
        apiUrl: apiUrl.value,
        path: '/pricing/changes/plan',
        method: 'POST',
        bearerToken: token.value,
        body: input,
      });
    },

    publishChange: async (input) => {
      const token = await readToken();

      if (result.isErr(token)) return token;

      return requestApi<PublishPricingChangeResult>({
        apiUrl: apiUrl.value,
        path: '/pricing/changes/publish',
        method: 'POST',
        bearerToken: token.value,
        body: input,
      });
    },

    close: async () => undefined,
  });
};
