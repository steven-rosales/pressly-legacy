import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync } from '@pressly/http/express';
import type { RevokeSession } from './revoke-session.usecase.ts';
import { readBearerToken } from '../http/read-bearer.ts';

export const makeRevokeSessionController = (
  revokeSession: RevokeSession,
): RequestHandler =>
  catchAsync(async (req, res) => {
    const revokeResult = await revokeSession({
      bearerToken: readBearerToken(req.header('authorization') ?? undefined),
      ...((res.locals?.['requestId'] as string | undefined) === undefined
        ? {}
        : { requestId: res.locals?.['requestId'] as string }),
    });

    if (result.isErr(revokeResult)) {
      res
        .status(revokeResult.error.status)
        .json(apiFailure(revokeResult.error));
      return;
    }

    res.status(200).json(apiSuccess(revokeResult.value));
  });
