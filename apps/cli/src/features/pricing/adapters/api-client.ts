import { result, type Result } from '@pressly/kernel';
import {
  pricingCatalogSchema,
  pricingChangePlanSchema,
  publishPricingChangeResultSchema,
} from '@pressly/contracts/pricing';
import { type AppError } from '@pressly/errors/app-error';
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

export const makeApiPricingClient = (
  env: ApiClientEnv,
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

      return requestApi({
        apiUrl: apiUrl.value,
        path: `/pricing/services/${encodeURIComponent(
          command.serviceSlug,
        )}/pricing`,
        method: 'GET',
        dataSchema: pricingCatalogSchema,
        bearerToken: token.value,
      });
    },

    planChange: async (input) => {
      const token = await readToken();

      if (result.isErr(token)) return token;

      return requestApi({
        apiUrl: apiUrl.value,
        path: '/pricing/changes/plan',
        method: 'POST',
        dataSchema: pricingChangePlanSchema,
        bearerToken: token.value,
        body: input,
      });
    },

    publishChange: async (input) => {
      const token = await readToken();

      if (result.isErr(token)) return token;

      return requestApi({
        apiUrl: apiUrl.value,
        path: '/pricing/changes/publish',
        method: 'POST',
        dataSchema: publishPricingChangeResultSchema,
        bearerToken: token.value,
        body: input,
      });
    },

    close: async () => undefined,
  });
};
