import type { RequestHandler } from 'express';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync } from '@pressly/http/express';
import { makeAppError } from '@pressly/errors';
import type { LoadSession } from '../../../features/load-session/load-session.usecase.ts';

const missingBearerToken = () =>
  makeAppError({
    kind: 'PermissionError',
    code: 'missing_bearer_token',
    message: 'Bearer token is required.',
    safeMessage: 'Authentication is required.',
    status: 401,
  });

const readBearerToken = (authorization: string | undefined): string => {
  if (authorization === undefined) throw missingBearerToken();

  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || token === undefined || token.trim() === '')
    throw missingBearerToken();

  return token;
};

export const makeLoadSessionController = (
  loadSession: LoadSession,
): RequestHandler =>
  catchAsync(async (req, res) => {
    const result = await loadSession({
      bearerToken: readBearerToken(req.header('authorization') ?? undefined),
    });

    if (!result.ok) {
      res.status(result.error.status).json(apiFailure(result.error));
      return;
    }

    if (result.value.sessionExpiresAt === undefined)
      throw makeAppError({
        kind: 'InvariantViolationError',
        code: 'loaded_session_missing_expiry',
        message: 'Loaded session principal is missing session expiry.',
        safeMessage: 'Session could not be loaded.',
        status: 500,
      });

    res.status(200).json(
      apiSuccess({
        principal: {
          identityId: result.value.identityId,
          displayName: result.value.displayName,
          ...(result.value.email === undefined
            ? {}
            : { email: result.value.email }),
          roles: [...result.value.roles],
        },
        expiresAt: result.value.sessionExpiresAt.toISOString(),
      }),
    );
  });
