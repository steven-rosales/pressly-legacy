import {
  defineRequestBoundary,
  sendValidatedApiValue,
} from '@pressly/http/express';
import type { RequestHandler } from 'express';
import {
  listIdentitySessionsContract,
  toSessionInventoryResult,
} from './list-identity-sessions.contract.mapper.ts';
import type { ListIdentitySessions } from './list-identity-sessions.usecase.ts';

export const listIdentitySessionsBoundary = defineRequestBoundary({
  params: listIdentitySessionsContract.params,
});

export const makeListIdentitySessionsController = (
  listIdentitySessions: ListIdentitySessions,
): RequestHandler =>
  listIdentitySessionsBoundary.handler(async ({ params }, { response }) => {
    const found = await listIdentitySessions(params.identityId);

    sendValidatedApiValue(response, found, {
      schema: listIdentitySessionsContract.response,
      present: toSessionInventoryResult,
    });
  });
