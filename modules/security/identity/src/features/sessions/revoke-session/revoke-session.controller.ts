import type { RequestHandler } from 'express';
import { sendValidatedApiValue } from '@pressly/http/express';
import type { RevokeSession } from './revoke-session.usecase.ts';
import { readBearerToken } from '../../../foundations/adapters/http/authentication-request/read-bearer.adapter.ts';
import {
  revokeSessionContract,
  toLogoutResult,
} from './revoke-session.contract.mapper.ts';

export const makeRevokeSessionController =
  (revokeSession: RevokeSession): RequestHandler =>
  async (req, res) => {
    const revokeResult = await revokeSession({
      bearerToken: readBearerToken(req.header('authorization') ?? undefined),
      ...((res.locals?.['requestId'] as string | undefined) === undefined
        ? {}
        : { requestId: res.locals?.['requestId'] as string }),
    });

    sendValidatedApiValue(res, revokeResult, {
      schema: revokeSessionContract.response,
      present: toLogoutResult,
    });
  };
