import {
  defineValidatedController,
  sendValidatedApiValue,
} from '@pressly/http/express';
import {
  listIdentitySessionsContract,
  toSessionInventoryResult,
} from './list-identity-sessions.contract.mapper.ts';
import type { ListIdentitySessions } from './list-identity-sessions.usecase.ts';

export const makeListIdentitySessionsController = (
  listIdentitySessions: ListIdentitySessions,
) =>
  defineValidatedController({
    request: { params: listIdentitySessionsContract.params },
    handle: async ({ params }, { response }) => {
      const found = await listIdentitySessions(params.identityId);

      sendValidatedApiValue(response, found, {
        schema: listIdentitySessionsContract.response,
        present: toSessionInventoryResult,
      });
    },
  });
