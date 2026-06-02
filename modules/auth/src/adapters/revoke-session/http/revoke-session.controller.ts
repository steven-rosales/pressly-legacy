import type { RequestHandler } from 'express';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync } from '@pressly/http/express';
import type { RevokeSession } from '../../../features/revoke-session/revoke-session.usecase.ts';
import { readBearerToken } from '../../common/persistence/read-bearer.ts';

export const makeRevokeSessionController = (
  revokeSession: RevokeSession,
): RequestHandler =>
  catchAsync(async (req, res) => {
    const result = await revokeSession({
      bearerToken: readBearerToken(req.header('authorization') ?? undefined),
    });

    if (!result.ok) {
      res.status(result.error.status).json(apiFailure(result.error));
      return;
    }

    res.status(200).json(apiSuccess(result.value));
  });
