import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync } from '@pressly/http/express';
import type { RevokeSession } from '../../../features/revoke-session/revoke-session.usecase.ts';
import { readBearerToken } from '../../common/read-bearer.ts';

export const makeRevokeSessionController = (
  revokeSession: RevokeSession,
): RequestHandler =>
  catchAsync(async (req, res) => {
    const revokeResult = await revokeSession({
      bearerToken: readBearerToken(req.header('authorization') ?? undefined),
    });

    if (result.isErr(revokeResult)) {
      res
        .status(revokeResult.error.status)
        .json(apiFailure(revokeResult.error));
      return;
    }

    res.status(200).json(apiSuccess(revokeResult.value));
  });
